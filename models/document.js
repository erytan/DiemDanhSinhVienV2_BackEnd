const mongoose = require('mongoose');
const { Schema } = mongoose;

const documentSchema = new Schema({

    document_id: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
    },
    type: {
        type: String,
        enum: ['announcement', 'assignment', 'material'], // Loại bài viết
        required: true,
    },
    attachments: [{ type: String }], // Mảng chứa đường dẫn đến các tệp đính kèm
    class_ids: [{
        _id: false, 
        class_id: {
            type: String, 
            required: true,
        },
        class_name: {
            type: String, 
            required: true,
        }
    }],
    author: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'user', 
    },
    tag: [{
        type: String,
        trim: true,
    }],
    readBy:[
        {
            user:{
                type: Schema.Types.ObjectId,
                required:true,
                ref:'user',
            },
            readAt:{
                type:Date,
                default:Date.now,
            }
        }
    ],
    views: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    // Tùy chọn: Thêm timestamps mặc định (createdAt và updatedAt)
    timestamps: true,
});
// Tạo index cho các trường thường dùng để query
documentSchema.index({ type: 1, class_ids: 1 });
module.exports = mongoose.model('document', documentSchema);