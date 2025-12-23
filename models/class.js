const mongoose = require("mongoose");
const { Schema } = mongoose;

const classSchema = new Schema({
    class_id: {
        type: String,
        required: true,
        unique: true
    },
    class_name: {
        type: String,
        required: true,
    },
    course_ids: [{
        type: String,
        required: true,
        ref: 'course',
    },],
    students: {
        type: [{
            type: String,
            ref: 'users',
        }],
        default: [] // 'default' bây giờ là một thuộc tính của trường students
    },
    weeks: {
        type: Number,
        required: true,
    },
    schedule: [{ // Thay đổi thành mảng các đối tượng
        dayOfWeek: {
            type: Number,
            required: true,
            min: 0, // 0 = chủ nhật
            max: 6, // 6 = Thứ bảy
        },
        time: {
            type: String,
            required: true,
            match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        },
    }],
});
// Tạo một compound index trên các trường dùng để query trong cron job
classSchema.index({ "schedule.dayOfWeek": 1, "schedule.time": 1 });
module.exports = mongoose.model("class", classSchema);