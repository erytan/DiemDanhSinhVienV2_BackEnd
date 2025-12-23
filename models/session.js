const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionSchema = new Schema({
    session_id: {
        type: String,
        required: true,
    },
    // Liên kết đến lớp học
    class_id: {
        type: String,
        required: true,
        ref: 'class',
        index: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    qr_code_data: {
        type: String,
    },
     durationInMinutes: {
        type: Number,
        default: 5, // Thời gian mặc định là 5 phút
        min: 1      // Thời gian tối thiểu là 1 phút
    },
    qr_code_expires_at:{
        type:Date,
    },
    // Mảng chứa thông tin điểm danh chi tiết của từng sinh viên
    attendance: [{
        student_id: {
            type: String,
            ref: 'users',
            required: true,
        },
        status: {
            type: String,
            enum: ['present', 'absent'],
            default: 'absent',
            required: true,
        },
        scanned_at: {
            type: Date,
        },
    }],
})

module.exports= mongoose.model("Session", sessionSchema);