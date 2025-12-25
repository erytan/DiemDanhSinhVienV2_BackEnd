const { v4: uuidv4 } = require('uuid');
const asyncHandler = require("express-async-handler")
const mongoose = require("mongoose")
const Session = require("../models/session")
const Class = require("../models/class")
const User = require("../models/user");
const crypto = require("crypto")
const Counter = require("../models/counter");

async function getNextSequenceValue(sequenceName) {
    const sequenceDocument = await Counter.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
    )
    return sequenceDocument.seq
}
// controllers/session.js

// CREATE: Giảng viên tạo một "khung" buổi học, chưa kích hoạt điểm danh
const createSession = asyncHandler(async (req, res) => {
    const { class_id } = req.body;
    if (!class_id) return res.status(400).json({ success: false, message: 'Class ID is required.' });

    // 1. Tìm lớp học để lấy danh sách sinh viên
    const foundClass = await Class.findOne({ class_id });
    if (!foundClass) return res.status(404).json({ success: false, message: 'Class not found.' });

    // 2. Tạo danh sách điểm danh ban đầu
    const initialAttendance = foundClass.students.map(studentId => ({
        student_id: studentId,
        status: 'absent'
    }));

    // 3. Sử dụng "Counters Collection" để tạo ID
    const sequenceValue = await getNextSequenceValue('session');
    const newSessionId = `SS${sequenceValue.toString().padStart(5, "0")}`;

    // 4. Tạo session mới mà KHÔNG có thông tin QR code
    const newSession = await Session.create({
        session_id: newSessionId,
        class_id: class_id,
        attendance: initialAttendance
        // Các trường qr_code_data, qr_code_expires_at, durationInMinutes sẽ để trống
    });

    res.status(201).json({
        success: true,
        message: 'Session created successfully. You can now generate a QR code to start attendance.',
        data: newSession
    });
});
const generateQrCode = asyncHandler(async (req, res) => {
    // Lấy session_id từ URL
    const { session_id } = req.params;
    // Lấy thời gian tùy chỉnh từ body
    const { durationInMinutes } = req.body;

    const session = await Session.findOne({ session_id });
    if (!session) return res.status(404).json({ success: false, message: "Session not found." });

    const duration = parseInt(durationInMinutes, 10) > 0 ? parseInt(durationInMinutes, 10) : 5; // Mặc định 5 phút

    // Tạo dữ liệu QR mới và thời gian hết hạn
    const newQrCodeData = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    // Cập nhật session trong database
    session.qr_code_data = newQrCodeData;
    session.qr_code_expires_at = expiresAt;
    session.durationInMinutes = duration;

    await session.save(); // Lưu lại thay đổi

    res.status(200).json({
        success: true,
        message: `QR code generated for session ${session_id}. Valid for ${duration} minutes.`,
        qr_code_data: newQrCodeData,
        expiresAt: expiresAt
    });
});
// Sinh viên quét mã qr 
const checkAttendance = asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    const { scannedQrCode } = req.body;
    const { user_id } = req.user; // ✅ BẢO MẬT: Lấy ID sinh viên từ token đã xác thực

    if (!scannedQrCode) {
        return res.status(400).json({
            success: false,
            message: "Qr Code data is required"
        })
    }
    const session = await Session.findOne({
        session_id: session_id,
        'attendance.student_id': user_id
    });
    if (!session) {
        return res.status(404).json({
            success: false,
            mess: "Session not found or you are not enrolled in this class."
        })
    }
    //--- Logic kiểm tra (Giữ nguyên) ---
    if (session.qr_code_data !== scannedQrCode) {
        return res.status(400).json({
            success: false,
            mess: "Invalid Qr code."
        })
    }
    if (new Date() > session.qr_code_expires_at) {
        return res.status(400).json({
            success: false,
            mess: "Qr code has expired."
        })
    }

    //Kiểm tra xem đã điểm danh chưa
    const studentAttendance = session.attendance.find(rec => rec.student_id === user_id);
    if (studentAttendance.status === 'present') {
        return res.status(409).json({
            success: false,
            mess: "You have already marked your attendance."
        })
    }
    // ✅ HIỆU NĂNG & AN TOÀN: Cập nhật trạng thái bằng một lệnh duy nhất
    await Session.updateOne(
        { session_id: session_id, "attendance.student_id": user_id },
        {
            $set: {
                "attendance.$.status": "present",
                "attendance.$.scanned_at": new Date()
            }
        }
    )
    res.status(200).json({
        success: true,
        mess: "Attendance marked successfully!"
    })
})


// Cấu hình số lần thử lại tối đa
const MAX_RETRIES = 5;

const generateDailySessions = async () => {
    // ÉP BUỘC LẤY GIỜ VIỆT NAM CHO LOGIC SO SÁNH
    const getVNTime = () => {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const dbSession = await mongoose.startSession();
        dbSession.startTransaction({ writeConcern: { w: 'majority' } });

        try {
            const now = getVNTime();
            const currentDayOfWeek = now.getDay(); // 0: Chủ nhật, 1: Thứ hai...
            
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);

            console.log(`[Attempt ${attempt}] Đang quét lớp học cho Thứ ${currentDayOfWeek === 0 ? 'CN' : currentDayOfWeek + 1}`);

            // 1. Tìm các lớp có lịch vào hôm nay
            const allClasses = await Class.find({
                weeks: { $gt: 0 },
                schedule: { $elemMatch: { dayOfWeek: currentDayOfWeek } }
            }).session(dbSession);

            if (!allClasses || allClasses.length === 0) {
                console.log("Không có lớp nào cần tạo session hôm nay.");
                await dbSession.commitTransaction();
                dbSession.endSession();
                return;
            }

            let totalGenerated = 0;

            for (const classItem of allClasses) {
                const todaySchedules = classItem.schedule.filter(sch => sch.dayOfWeek === currentDayOfWeek);
                let hasCreated = false;

                for (const scheduleItem of todaySchedules) {
                    const [hour, minute] = scheduleItem.time.split(':').map(Number);
                    const sessionDate = new Date(today);
                    sessionDate.setHours(hour, minute, 0, 0);

                    // Kiểm tra trùng lặp
                    const exists = await Session.findOne({
                        class_id: classItem.class_id,
                        date: sessionDate
                    }).session(dbSession);

                    if (exists) continue;

                    const sequence = await getNextSequenceValue('session');
                    const newId = `SS${sequence.toString().padStart(5, "0")}`;

                    await Session.create([{
                        session_id: newId,
                        class_id: classItem.class_id,
                        date: sessionDate,
                        attendance: classItem.students.map(id => ({ student_id: id, status: 'absent' }))
                    }], { session: dbSession });

                    totalGenerated++;
                    hasCreated = true;
                }

                if (hasCreated) {
                    // Dùng updateOne để tránh xung đột version (__v) của Mongoose khi save()
                    await Class.updateOne(
                        { _id: classItem._id },
                        { $inc: { weeks: -1 } }
                    ).session(dbSession);
                }
            }

            await dbSession.commitTransaction();
            dbSession.endSession();
            console.log(`Đã tạo thành công ${totalGenerated} buổi học.`);
            return;

        } catch (error) {
            await dbSession.abortTransaction();
            dbSession.endSession();

            const isTransient = error.code === 112 || (error.errorLabelSet && error.errorLabelSet.has('TransientTransactionError'));
            
            if (isTransient && attempt < MAX_RETRIES) {
                console.warn(`Xung đột DB, đang thử lại lần ${attempt + 1}...`);
                await new Promise(res => setTimeout(res, 100 * attempt));
                continue;
            }
            throw error; // Lỗi nghiêm trọng thì bắn ra ngoài cho Cron bắt được
        }
    }
};
const getAllSession = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sessions, total] = await Promise.all([
        Session.find().sort({ date: -1 }).skip(skip).limit(parseInt(limit))
            .populate({
                path: 'class_id',
                model: 'class',
                foreignField: 'class_id'
            })
            .populate({
                path: 'attendance.student_id',
                model: 'users',
                select: 'user_id firstname lastname',
                foreignField: 'user_id'
            }),
        Session.countDocuments()
    ]);

    res.status(200).json({
        success: true,
        data: sessions,
        pagination: { total, page: parseInt(page), totalPages: Math.ceil(total / limit) }
    })
})
const getSession = asyncHandler(async (req, res) => {
    const { session_id } = req.params;

    const session = await Session.findOne({ session_id })
        .populate({ path: 'class_id', model: 'class', foreignField: 'class_id' })
        .populate({
            path: 'attendance.student_id',
            model: 'users',
            select: 'user_id firstname lastname',
            foreignField: 'user_id'
        })
    if (!session) {
        return res.status(404).json({
            success: false,
            message: "Session not found"
        })
    }
    res.status(200).json({
        success: true,
        data: session,
    })
})

const updateSession = asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    const updateData = req.body;
    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            success: false,
            message: "Update data is required."
        })
    }
    const updatedSession = await Session.findOneAndUpdate(
        { session_id },
        updateData,
        { new: true, runValidators: true }
    );
    if (!updatedSession) {
        return res.status(404).json({
            success: false,
            message: "Session not found"
        });
    }
    res.status(200).json({
        success: true,
        message: "Session updated successfully.", data: updatedSession
    })
})
const deleteSession = asyncHandler(async (req, res) => {
    const { session_id } = req.params;
    const deletedSession = await Session.findOneAndDelete({ session_id })
    if (!deletedSession) {
        return res.status(404).json({
            success: false,
            message: "Session not found."
        });
    }
    res.status(200).json({
        success: true,
        message: "Session deleted successfully"
    })
})
// Lấy tối đa 4 môn học theo user có trong hôm nay
const getTodaySessionByUser = asyncHandler(async (req, res) => {
    const { user_id } = req.user;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = await Session.find({
        date: { $gte: startOfDay, $lte: endOfDay },
        "attendance.student_id": user_id 
    })
    .sort({ date: 1 })
    .limit(4)
    .populate({
        path: 'class_id',
        model: 'class',
        localField: 'class_id',    
        foreignField: 'class_id', 
        select: 'class_name course_ids', 
        populate: {
            path: 'course_ids',
            model: 'course',
            localField: 'course_ids',
            foreignField: 'course_id',
            select: 'name -_id' 
        }
    })
    .lean();

    const formattedData = sessions.map(session => {
        const sessionDate = new Date(session.date);
        
        // 1. Định dạng thời gian
        const startTime = sessionDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        const endTimeDate = new Date(sessionDate.getTime() + (2 * 60 + 30) * 60 * 1000); 
        const endTime = endTimeDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

        const days = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
        
        // 2. LẤY TRẠNG THÁI ĐIỂM DANH CỦA RIÊNG USER NÀY
        const userAttendance = session.attendance?.find(att => att.student_id === user_id);
        const attendanceStatus = userAttendance ? userAttendance.status : 'absent';

        return {
            session_id: session.session_id,
            subject_name: session.class_id?.course_ids?.[0]?.name || "Môn học không xác định",
            day_info: `${days[sessionDate.getDay()]}, ${sessionDate.getDate()}/${sessionDate.getMonth() + 1}`,
            time_range: `${startTime} - ${endTime}`,
            room: ` Phòng ${session.class_id?.class_name}` || "Phòng học chưa xác định",
            status: attendanceStatus // Thêm trường status: 'present' hoặc 'absent'
        };
    });

    res.status(200).json({
        success: true,
        data: formattedData
    });
});
    
module.exports = {
    createSession,
    generateQrCode,
    checkAttendance,
    generateDailySessions,
    deleteSession,
    updateSession,
    getSession,
    getAllSession,
    getTodaySessionByUser,
}