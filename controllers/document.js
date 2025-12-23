const Document = require('../models/document');
const asyncHandler = require('express-async-handler');
const Counter = require('../models/counter');
const Class = require('../models/class');
const User = require('../models/user')
//Helper tạo sequence ID tự động
async function getNextSequenceValue(sequenceName) {

    const sequenceDocument = await Counter.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return sequenceDocument.seq;
}
//Helper truy vấn Document theo danh sách Class ID 
async function getDocumentsByClassIds(classIds, limit = 4) {
    const query = {
        class_ids: {
            $elemMatch: {
                class_id: { $in: classIds }
            }
        }
    };
    return Document.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('document_id title type content attachments author createdAt')
        .populate({
            path: 'author',
            model: 'users',
            select: 'user_id firstname lastname',
        })
        .lean();
}
const createDocument = asyncHandler(async (req, res) => {
    const { title, class_ids: classesToSave, tag, type, content, attachments, views, author } = req.body;
    // Giả định Author được lấy từ đối tượng user đã xác thực (req.user.id)
    const authorId = req.user ? req.user.id : author;
    // const classes = await Class.find({
    //     class_id: { $in: class_ids }
    // }).select('class_id class_name');
    // const denormalizedClassIds = classes.map(classDoc => ({
    //     class_id: classDoc.class_id, // Lấy ID tùy chỉnh từ class_code
    //     class_name: classDoc.class_name
    // }));
    //Generate document_id
    const sequenceValue = await getNextSequenceValue('document');
    const newDocumentId = `DOC${sequenceValue.toString().padStart(6, '0')}`;

    //Create new document
    const newDocument = await Document.create({
        document_id: newDocumentId,
        title,
        content,
        type,
        attachments,
        class_ids: classesToSave,
        tag: tag,
        author: authorId,
        views: views || 0,
    });
    res.status(201).json({
        success: true,
        data: newDocument,
        message: 'Document created successfully',
    });
});
//Lấy danh sách document theo class_id
const getDocumentsByClassId = asyncHandler(async (req, res) => {
    const { class_id } = req.params;
    const user = req.user; // từ token

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!class_id) {
        return res.status(400).json({
            success: false,
            error: "Class ID is required."
        });
    }

    // 1️⃣ Tìm lớp học
    const existingClass = await Class.findOne({ class_id }).lean();

    if (!existingClass) {
        return res.status(404).json({
            success: false,
            error: "Class not found."
        });
    }

    // 2️⃣ KIỂM TRA QUYỀN (QUAN TRỌNG 🔥)
    // Admin thì cho xem hết
    if (user.role !== 'admin') {
        const isStudentInClass = existingClass.students.includes(user.user_id);

        if (!isStudentInClass) {
            return res.status(403).json({
                success: false,
                error: "You are not a member of this class."
            });
        }
    }

    // 3️⃣ Query document (sau khi đã check quyền)
    const query = {
        'class_ids.class_id': class_id
    };

    const total = await Document.countDocuments(query);

    const documents = await Document.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('document_id title type content tag attachments author views readBy createdAt')
        .populate({
            path: 'author',
            model: 'users',
            select: 'user_id firstname lastname'
        })
        .lean();

    // 4️⃣ Đánh dấu đã đọc hay chưa
    const userObjectId = user._id.toString();

    const result = documents.map(doc => ({
        ...doc,
        isRead: doc.readBy?.some(
            r => r.user?.toString() === userObjectId
        ),
        totalReadBy: doc.readBy?.length || 0
    }));

    res.status(200).json({
        success: true,
        class_name: existingClass.class_name,
        documents: result,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
});

// Select 4 document
const getFirstFourDocument = asyncHandler(async (req, res) => {
    // 1️⃣ Lấy ObjectId từ token
    const studentObjectId = req.user?.id || req.user?._id;

    if (!studentObjectId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Token ID not found."
        });
    }

    try {
        // 2️⃣ Lấy user_id (STRING) để khớp với Class.students
        const user = await User.findById(studentObjectId).select('user_id');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found in DB."
            });
        }

        const studentIdToMatch = user.user_id;

        // 3️⃣ Tìm các lớp sinh viên tham gia
        const userClasses = await Class.find(
            { students: studentIdToMatch }
        ).select('class_id');

        const classIds = userClasses.map(cls => cls.class_id);

        if (classIds.length === 0) {
            return res.status(200).json({
                success: true,
                document: [],
                message: "Người dùng chưa tham gia lớp học nào."
            });
        }

        // 4️⃣ Query document (LẤY 4 CÁI MỚI NHẤT)
        const documents = await Document.find({
            'class_ids.class_id': { $in: classIds }
        })
            .sort({ createdAt: -1 })
            .limit(4)
            // ✅ SELECT FIELD BẠN MUỐN
            .select('document_id title content  author views creatAt')
            .populate({
                path: 'author',
                model: 'users',
                select: 'user_id firstname lastname'
            })
            .lean();

        return res.status(200).json({
            success: true,
            document: documents
        });

    } catch (error) {
        console.error("Lỗi khi lấy 4 document đầu:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi server nội bộ.",
            error: error.message
        });
    }
});

//Lấy tất cả document (dành cho admin)
const getAllDocuments = asyncHandler(async (req, res) => {
    // ✅ SỬA: Dùng {} để lấy tất cả tài liệu, bỏ req.params.id
    const documents = await Document.find({})
        .sort({ createdAt: -1 })
        .select('document_id title content tag class_ids type attachments author views createdAt')
        .populate({
            path: 'author',
            model: 'users',
            select: 'user_id firstname lastname',
        })
        .lean();

    res.json({
        success: true,
        data: documents
    })
})
//Update document 
const updateDocument = asyncHandler(async (req, res) => {
    const { id } = req.params; // <--- nhận _id từ URL
    const updateData = req.body;

    // Lấy user ID hiện tại (token)
    const currentUserId = req.user?.id || req.user?._id;

    if (!currentUserId) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized: User information missing."
        });
    }

    // Không cho phép chỉnh sửa các trường nhạy cảm
    delete updateData._id;
    delete updateData.document_id;
    delete updateData.createdAt;
    delete updateData.views;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, error: "Update data is required." });
    }

    // Validate type
    if (updateData.type && !['announcement', 'assignment', 'material'].includes(updateData.type)) {
        return res.status(400).json({ success: false, error: "Invalid document type." });
    }

    // 1. Tìm tài liệu gốc bằng _id
    const originalDocument = await Document.findById(id).select("author");

    if (!originalDocument) {
        return res.status(404).json({ success: false, error: "Document not found." });
    }

    const originalAuthorId = originalDocument.author?.toString();
    const currentUserString = currentUserId.toString();

    // 2. Kiểm tra quyền tác giả
    if (originalAuthorId !== currentUserString) {
        return res.status(403).json({
            success: false,
            error: "Access denied. You are not the author of this document."
        });
    }

    // 3. Cập nhật document bằng _id
    const updatedDocument = await Document.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
    ).populate({
        path: "author",
        model: "users",
        select: "user_id firstname lastname"
    });

    if (!updatedDocument) {
        return res.status(404).json({ success: false, error: "Document not found." });
    }

    res.status(200).json({
        success: true,
        data: updatedDocument,
        message: "Document updated successfully."
    });
});

//Delete document
const deleteDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deletedDocument = await Document.findByIdAndDelete(id);

    if (!deletedDocument) {
        return res.status(404).json({ success: false, error: "Document not found." });
    }

    res.status(200).json({
        success: true,
        message: "Document deleted successfully.",
        data: deletedDocument,
    });
});
//Khi user click vào thì tính là 1 view cho Document
const getDocumentView = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        // 1 Tìm document (để xử lý readBy)
        const doc = await Document.findById(id);

        if (!doc) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        // 2 Check đã đọc chưa
        const hasRead = doc.readBy.some(
            item => item.user.toString() === userId.toString()
        );

        if (!hasRead) {
            doc.readBy.push({ user: userId });
            doc.views += 1;
            await doc.save();
        }

        // 3 Lấy lại document với các field cần trả
        const result = await Document.findById(id)
            .select('document_id title content attachments author views')
            .populate({
                path: 'author',
                model: 'users',
                select: 'user_id firstname lastname'
            })
            .lean();

        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

//Lấy document theo user của người dùng 
const getDocumentsForStudent = asyncHandler(async (req, res) => {
    const userId = req.user.user_id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 1 Tìm các lớp mà sinh viên đang học
    const classes = await Class.find(
        { students: userId }, // ⭐ QUAN TRỌNG
        { class_id: 1, class_name: 1 }
    ).lean();

    if (!classes.length) {
        return res.status(200).json({
            success: true,
            documents: [],
            message: 'Student is not enrolled in any class'
        });
    }

    // 2 Lấy danh sách class_id
    const classIds = classes.map(c => c.class_id);

    // 3 Query document theo các class_id
    const query = {
        'class_ids.class_id': { $in: classIds }
    };

    const total = await Document.countDocuments(query);

    let documents = await Document.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('document_id title type tag content attachments author views readBy createdAt')
        .populate({
            path: 'author',
            model: 'users',
            select: 'user_id firstname lastname'
        })
        .lean();

    // 4 Đánh dấu document đã đọc hay chưa
    documents = documents.map(doc => ({
        ...doc,
        isRead: doc.readBy?.some(
            r => r.user?.toString() === req.user._id.toString()
        ),
        totalReadBy: doc.readBy?.length || 0
    }));

    res.status(200).json({
        success: true,
        documents,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    });
});

module.exports = {
    createDocument,
    getDocumentView,
    getDocumentsForStudent,
    getDocumentsByClassId,
    getFirstFourDocument,
    getAllDocuments,
    updateDocument,
    deleteDocument,
};