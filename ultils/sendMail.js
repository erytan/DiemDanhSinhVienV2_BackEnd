const nodemailer = require('nodemailer');
const asyncHandler = require('express-async-handler');

const sendMail = asyncHandler(async (data) => {
    const { email, html ,attachments } = data; // Lấy email và nội dung HTML từ đối số data
    let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_NAME,
            pass: process.env.EMAIL_APP_PASSWORD,
        },
    });
    let info = await transporter.sendMail({
        from: '"Điểm danh sinh viên" <yourgmail@gmail.com>',
        to: email,
        subject: "Forget password",
        html,
        replyTo: "no-reply@diemdanhsinhvien.com", // người dùng reply sẽ gửi về đây
        attachments: attachments || [], // ✅ fix: luôn có giá trị (mảng rỗng nếu không có)
    });
    return info;
});

module.exports = sendMail