const Course = require('../models/course');
const Counter = require('../models/counter');
const Class = require("../models/class");
const User = require('../models/user');
const asyncHandler = require("express-async-handler");
const XLSX = require("xlsx");
const fs = require("fs");
const Sessions = require('../models/session')
// Helper tạo sequence tự động
async function getNextSequenceValue(sequenceName) {
  const sequenceDocument = await Counter.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return sequenceDocument.seq;
}


// 🟩 CREATE CLASS with add Excel
const createClassAddExcel = asyncHandler(async (req, res) => {
  try {
    let { class_name, course_ids, schedule, weeks } = req.body;
    const excelFile = req.file;

    // Parse nếu gửi dưới dạng FormData (string JSON)
    if (typeof course_ids === 'string') course_ids = JSON.parse(course_ids);
    if (typeof schedule === 'string') schedule = JSON.parse(schedule);
    weeks = Number(weeks);

    // Validate input cơ bản
    if (!class_name || !Array.isArray(course_ids) || course_ids.length === 0 || !weeks || !Array.isArray(schedule)) {
      return res.status(400).json({
        success: false,
        error: "Invalid input. 'class_name', 'course_ids', 'weeks', and 'schedule' are required.",
      });
    }

    // Check tồn tại khóa học
    const courseCount = await Course.countDocuments({ course_id: { $in: course_ids } });
    if (courseCount !== course_ids.length) {
      return res.status(404).json({
        success: false,
        error: "One or more courses not found. Please check the course IDs.",
      });
    }

    const studentIds = [];

    // Nếu có file Excel, xử lý
    if (excelFile) {
      try {
        const workbook = XLSX.readFile(excelFile.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        for (const row of data) {
          const MSSV = String(row.MSSV || "").trim();
          const FirstName = String(row.FirstName || "").trim();
          const LastName = String(row.LastName || "").trim();
          const ClassName = String(row.Class || "").trim();
          const Mobile = row.Mobile ? String(row.Mobile).trim() : `000${Date.now()}${Math.floor(Math.random() * 1000)}`;
          const Email = row.Email ? String(row.Email).trim() : `${MSSV}@gmail.com`;

          if (!MSSV) continue;

          let existingUser = await User.findOne({ user_id: MSSV });
          if (!existingUser) {
            const newUser = await User.create({
              user_id: MSSV,
              firstname: FirstName,
              lastname: LastName,
              email: Email,
              class: ClassName,
              mobile: Mobile,
              password: MSSV, // password = MSSV
            });
            studentIds.push(newUser.user_id);
          } else {
            studentIds.push(existingUser.user_id);
          }
        }

        fs.unlinkSync(excelFile.path); // Xóa file sau khi xử lý
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: "Error processing Excel file: " + err.message,
        });
      }
    }

    // Tạo class_id mới
    const sequenceValue = await getNextSequenceValue("class");
    const newClassId = `LH${sequenceValue.toString().padStart(5, "0")}`;

    // Tạo class
    const newClass = await Class.create({
      class_id: newClassId,
      class_name,
      course_ids,
      students: studentIds,
      schedule,
      weeks,
    });

    return res.status(201).json({
      success: true,
      message: "Class created successfully!",
      data: newClass,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Server error: " + err.message,
    });
  }
});

const createClass = asyncHandler(async (req, res) => {
  const { class_name, course_ids, students, schedule, weeks } = req.body;

  // Validate
  if (!class_name || typeof class_name !== "string") {
    return res.status(400).json({ success: false, error: "'class_name' is required and must be a string." });
  }

  if (!Array.isArray(course_ids) || course_ids.length === 0 || !weeks || !Array.isArray(schedule)) {
    return res.status(400).json({
      success: false,
      error: "Invalid input. 'course_ids', 'weeks', and 'schedule' are required.",
    });
  }

  // Check course existence
  const courseCount = await Course.countDocuments({ course_id: { $in: course_ids } });
  if (courseCount !== course_ids.length) {
    return res.status(404).json({
      success: false,
      error: "One or more courses not found. Please check the course IDs.",
    });
  }

  // Generate new class_id
  const sequenceValue = await getNextSequenceValue("class");
  const newClassId = `LH${sequenceValue.toString().padStart(5, "0")}`;

  // Create
  const newClass = await Class.create({
    class_id: newClassId,
    class_name,
    course_ids,
    students,
    schedule,
    weeks,
  });

  res.status(201).json({
    success: true,
    message: "Class created successfully!",
    data: newClass,
  });
});

// 🟩 GET ALL CLASSES
const getAllClasses = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [classes, total] = await Promise.all([
    Class.find().skip(skip).limit(limit).populate([
      {
        path: "students",
        model: "users",
        select: "user_id firstname lastname",
        foreignField: "user_id",
      },
      {
        path: "course_ids",
        model: "course",
        select: "course_id name",
        foreignField: "course_id",
      },
    ]),
    Class.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    data: classes,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});
// 🟩 GET ALL CLASSES ONLY NAME
const getAllClassesOnlyName = asyncHandler(async (req, res) => {
  const classOnylyName = await Class.find(req.params.id)
    .sort({ createdAt: -1 })
    .select('class_name class_id')

  res.json({
    success: true,
    data: classOnylyName
  })

})
// 🟩 GET SINGLE CLASS
const getSingleClass = asyncHandler(async (req, res) => {
  const { class_id } = req.params;

  const foundClass = await Class.findOne({ class_id }).populate([
    { path: "students", model: "users", foreignField: "user_id" },
    { path: "course_ids", model: "course", foreignField: "course_id" },
  ]);

  if (!foundClass) {
    return res.status(404).json({ success: false, error: "Class not found." });
  }

  res.status(200).json({ success: true, data: foundClass });
});

// 🟩 UPDATE CLASS
const updateClass = asyncHandler(async (req, res) => {
  const { class_id } = req.params;
  const updateData = req.body;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      error: "Update data is required.",
    });
  }

  // Validate course_ids
  if (updateData.course_ids) {
    if (!Array.isArray(updateData.course_ids)) {
      return res.status(400).json({ success: false, error: "'course_ids' must be an array." });
    }
    const courseCount = await Course.countDocuments({ course_id: { $in: updateData.course_ids } });
    if (courseCount !== updateData.course_ids.length) {
      return res.status(404).json({ success: false, error: "One or more courses not found." });
    }
  }

  // Validate students
  if (updateData.students) {
    if (!Array.isArray(updateData.students)) {
      return res.status(400).json({ success: false, error: "'students' must be an array." });
    }
    const studentCount = await User.countDocuments({ user_id: { $in: updateData.students } });
    if (studentCount !== updateData.students.length) {
      return res.status(404).json({ success: false, error: "One or more students not found." });
    }
  }

  // Validate class_name
  if (updateData.class_name && typeof updateData.class_name !== "string") {
    return res.status(400).json({ success: false, error: "'class_name' must be a string." });
  }

  // Update
  const updatedClass = await Class.findOneAndUpdate(
    { class_id },
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedClass) {
    return res.status(404).json({ success: false, error: "Class not found." });
  }

  res.status(200).json({
    success: true,
    message: "Class updated successfully!",
    data: updatedClass,
  });
});

// 🟩 DELETE CLASS
const deleteClass = asyncHandler(async (req, res) => {
  const { class_id } = req.params;
  if (!class_id) {
    return res.status(400).json({
      success: false,
      mess: "Class ID is required to delete a class.",
    });
  }

  const deletedClass = await Class.findOneAndDelete({ class_id });
  if (!deletedClass) {
    return res.status(404).json({
      success: false,
      mess: "Class not found.",
    });
  }

  res.status(200).json({
    success: true,
    mess: "Class deleted successfully!",
    data: deletedClass,
  });
});

const checkClassDelete = asyncHandler(async (req, res) => {
  const { class_id } = req.params;
  if (!class_id) {
    return res.status(400).json({
      success: false,
      canDelete: false,
      message: "class_id  is required.",
    })
  }
  const cls = await Class.findOne({ class_id });
  if (!cls) {
    return res.status(404).json({
      success: false,
      canDelete: false,
      message: "Class not found."
    })
  }
  if (cls.students && cls.students.length > 0) {
    return res.json({
      success: true,
      canDelete: false,
      message: "Lớp học này đang có sinh viên, không thể xóa!",
    })
  }
  // TODO: Kiểm tra session
  const sessionCount = await Sessions.countDocuments({ class_id: class_id });
  if (sessionCount > 0)
    return res.json({
      success: true,
      canDelete: false,
      message: "Lớp học đang có session, không thể xóa!"
    })
  return res.json({ success: true, canDelete: true, message: "Lớp học có thể xóa." });
})
//thống kê của sinh viên trong một khóa học. 
const getStudentCourseStats = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin cần thiết từ request
  // 💡 Đã thay đổi: Lấy Mã Lớp học (class_id)
  const { class_id } = req.params;
  const studentId = req.user.user_id; // Mã sinh viên (String ID tùy chỉnh)

  if (!class_id) {
    return res.status(400).json({
      success: false,
      mess: "Vui lòng cung cấp mã lớp học (class_id)."
    });
  }

  // 2. Aggregation Pipeline
  const pipeline = [

    // B1: Lọc (MATCH) trực tiếp trên Session collection
    {
      $match: {
        // Lọc theo Mã Lớp học được cung cấp
        class_id: class_id,

        // Lọc các Session có chứa studentId này trong mảng điểm danh
        'attendance.student_id': studentId,
      },
    },

    // B2: PROJECT - Chỉ giữ lại thông tin điểm danh của sinh viên đang truy vấn
    {
      $project: {
        // Chúng ta chỉ cần thông tin điểm danh của sinh viên này
        attendanceStatus: {
          $filter: {
            input: '$attendance',
            as: 'att',
            // Lọc mảng attendance để tìm object có student_id = studentId
            cond: { $eq: ['$$att.student_id', studentId] }
          }
        }
      }
    },

    // B3: GROUP - Tính toán thống kê cuối cùng
    {
      $group: {
        _id: null, // Nhóm tất cả lại để tính tổng
        totalSessions: { $sum: 1 },
        presentCount: {
          $sum: {
            // Kiểm tra trạng thái "present"
            $cond: [
              { $eq: [{ $arrayElemAt: ['$attendanceStatus.status', 0] }, 'present'] },
              1,
              0
            ]
          }
        },
        absentCount: {
          $sum: {
            // Kiểm tra trạng thái "absent"
            $cond: [
              { $eq: [{ $arrayElemAt: ['$attendanceStatus.status', 0] }, 'absent'] },
              1,
              0
            ]
          }
        },
      }
    }
  ];

  // 3. Thực hiện truy vấn và xử lý kết quả
  const result = await Sessions.aggregate(pipeline);

  if (result.length === 0 || result[0].totalSessions === 0) {
    return res.json({
      success: true,
      stats: {
        totalSessions: 0,
        presentCount: 0,
        absentCount: 0,
        attendanceRate: 0,
        isEligible: false
      },
      message: `Chưa có buổi học nào thuộc lớp này.`
    });
  }

  const { totalSessions, presentCount, absentCount } = result[0];
  const attendanceRate = totalSessions > 0 ? (presentCount / totalSessions * 100).toFixed(1) : 0;
  const isEligible = parseFloat(attendanceRate) >= 80;

  return res.json({
    success: true,
    data: {
      totalSessions,
      presentCount,
      absentCount,
      attendanceRate: parseFloat(attendanceRate),
      isEligible,
    }
  });
});

const getClassByUserInClass = asyncHandler(async (req, res) => {
  const studentId = req.user.user_id;
  if (!studentId) {
    return res.status(400).json({
      success: false,
      mes: "không tìm thấy ID của sinh viên"
    })
  }
  // Aggregation Pipeline trên class collection
  const pipeline = [
    //B1: Lọc Class mà sinh viên này tham gia ( Tối ưu hóa: lọc sớm)\
    {
      $match: {
        students: studentId,
      },
    },
    // B2: Thực hiện JOIN (từ class sang course) để lấy tên môn học
    {
      $lookup: {
        from: 'courses',
        localField: 'course_ids',
        foreignField: 'course_id',
        as: 'courseDetails'
      }
    },
    // B3: Project - dinh hình lại output 
    {
      $project: {
        _id: 0,
        classId: '$class_id',
        className: '$class_name',
        // Định dạng lại mảng Course Details chỉ lấy ID và Name
        courses: {
          $map: {
            input: '$courseDetails',
            as: 'course',
            in: {
              courseId: '$$course.course_id',
              courseName: '$$course.name'
            }
          }
        }
      }
    }
  ];
  const classes = await Class.aggregate(pipeline);
  if (classes.length === 0) {
    return res.json(
      {
        success: true,
        classes: [],
        mess: "Sinh viên chưa đăng ký lớp học nào.",
      }

    )
  }
  return res.json({
    success: true,
    data: classes
  });
})
module.exports = {
  createClass,
  getSingleClass,
  updateClass,
  deleteClass,
  getAllClasses,
  createClassAddExcel,
  checkClassDelete,
  getAllClassesOnlyName,
  getClassByUserInClass,
  getStudentCourseStats,
};

