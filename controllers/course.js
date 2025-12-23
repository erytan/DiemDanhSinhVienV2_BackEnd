const Course = require("../models/course")
const Class = require("../models/class")
const asyncHandler = require("express-async-handler")
const Counter = require('../models/counter');

// Hàm helper để lấy số thứ tự tiếp theo một cách an toàn
async function getNextSequenceValue(sequenceName) {
    const sequenceDocument = await Counter.findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { seq: 1 } },
        { new: true, upsert: true } // upsert: true sẽ tự tạo bộ đếm nếu chưa có
    );
    return sequenceDocument.seq;
}
const createCourse = asyncHandler(async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({
        success: false,
        mess: "Missing required fields: name",
      });
    }

    const { name } = req.body;
    const { _id } = req.user; // 👈 dùng ObjectId chứ không phải user_id string

    // Tạo mã môn học tự động
    const sequenceValue = await getNextSequenceValue("course");
    const newCourseId = `MH${sequenceValue.toString().padStart(5, "0")}`;

    const newCourse = await Course.create({
      course_id: newCourseId,
      name,
      user_id: _id, // Lưu ObjectId user
    });

    const populatedCourse = await Course.findById(newCourse._id)
      .populate("user_id", "firstname lastname email user_id");

    res.status(201).json({
      success: true,
      mess: "Create course successfully",
      data: populatedCourse, // gửi kèm thông tin user
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      err: err.message || "Đã xảy ra lỗi máy chủ nội bộ",
    });
  }
});
const getAllCourses = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    //Lấy dữ liệu theo trang và tổng số document
    const [courses, total] = await Promise.all([
        Course.find().skip(skip).limit(limit).populate({
            path: 'user_id',
            model: 'users',
            select: 'firstname lastname user_id email', // Chọn các trường cần lấy từ User
            foreignField: 'user_id' //Rất quan trọng: Nối với trường này trong User model
        }),
        Course.countDocuments()
    ]);
    res.status(200).json({
        success: true,
        data: courses,
        pagination: {
            total, page, limit, totalPages: Math.ceil(total / limit)
        }
    })
})
const getCourse = asyncHandler(async (req, res) => {
    try {
        const { cid } = req.params;
        const course = await Course.findOne({ course_id: cid }).populate({
            path: 'user_id',
            model: 'users',
            select: 'firstname lastname user_id email',
            foreignField: 'user_id' // << Rất quan trọng
        })
        if (!course) {
            return res.status(404).json({
                success: false,
                mess: "Không tìm thấy khóa học"
            })
        }
        res.status(200).json({
            succes: true,
            data: course
        })
    }
    catch (err) {
        res.status(500).json({
            success: false,
            mes: "Something went wrong"
        })
    }
})

const updateCourse = asyncHandler(async (req, res) => {
    const { cid  } = req.params;
    const updateData = req.body;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            success: false,
            mess: "No data provided for update."
        });
    }

    const updatedCourse = await Course.findOneAndUpdate(
         { _id: cid },  // dùng cid từ params             
        updateData,              
        { new: true, runValidators: true } 
    );

    if (!updatedCourse) {
        return res.status(404).json({
            success: false,
            mess: `Course with ID '${_id}' not found.` // ❌ sửa từ course_id -> _id
        });
    }

    res.status(200).json({
        success: true,
        mess: "Update course successfully",
        data: updatedCourse
    });
});

const deleteCourse = asyncHandler(async (req, res) => {
    const { course_id } = req.params;

    // 1. Dùng .exists() để kiểm tra hiệu quả hơn
    const isCourseInUse = await Class.exists({ course_ids: course_id });

    if (isCourseInUse) {
        return res.status(409).json({ // 409 Conflict là lựa chọn rất tốt!
            success: false,
            message: "This course cannot be deleted because it is being used by at least one class."
        });
    }

    // 2. Thực hiện xóa
    const deletedCourse = await Course.findOneAndDelete({ course_id: course_id });

    if (!deletedCourse) {
        return res.status(404).json({
            success: false,
            message: `Course with ID '${course_id}' not found.`
        });
    }

    res.status(200).json({
        success: true,
        message: `Course '${deletedCourse.name}' has been successfully deleted.`
    });
});
module.exports = {
    createCourse,
    getCourse,
    updateCourse,
    deleteCourse,
    getAllCourses,
}