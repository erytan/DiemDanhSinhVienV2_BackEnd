const mongoose = require('mongoose');
const bcrypt = require("bcrypt");
const { string } = require('joi');
const userSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        unique: true,
    },
    firstname: {
        type: String,
        required: true,
    },
    lastname: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: [1, 2, 3],
        default: "2",
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    class: {
        type: String,
    },
    mobile: {
        type: Number,
        required: false,
        unique: true,
    },
    deviceSessions: [
        {
            deviceId: { type: String },
            lastLogout: { type: Date, default: null }
        }
    ],
    password: {
        type: String,
        required: true,
    },
    passwordResetOTP: {
        type: String,
    },
    passwordResetExpires: {
        type: Date,
    },
}, {
    timestamps: true
});
// Middleware để mã hóa mật khẩu trước khi lưu
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        next();
    }
    const salt = bcrypt.genSaltSync(10);
    this.password = await bcrypt.hashSync(this.password, salt);
})
// Phương thức để so sánh mật khẩu
userSchema.methods = {
    isCorrectPassword: async function (password) {
        return await bcrypt.compare(password, this.password);
    }
}
module.exports = mongoose.model('users', userSchema);