const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uploadDir = path.join(__dirname, "../uploads");

// Tạo thư mục lưu trữ nếu chưa tồn tại
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const safeName = file.fieldname + '-' + uniqueSuffix + ext;
        cb(null, safeName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        // EXCEL (Giữ lại)
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        // PDF (Thêm)
        "application/pdf",
        // DOCX (Thêm)
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        // DOC (Thêm)
        "application/msword",
        // TEXT (Thêm)
        "text/plain",
        // ZIP/RAR (Tùy chọn)
        "application/zip",
        "application/x-rar-compressed",
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only Excel files are allowed."));
    }
}
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})
module.exports = upload;