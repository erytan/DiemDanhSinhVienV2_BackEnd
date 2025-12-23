const express = require('express');
require('dotenv').config({ debug: false });
const dbConnect = require('./config/dbConnect');
const initRoutes = require('./routes');
const cors = require('cors');
const cron = require('node-cron');
const { generateDailySessions } = require('./controllers/session')
const app = express();
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 8080;

// Cấu hình CORS để chấp nhận các URL tạm thời từ VS Code
app.use(cors({
    origin: function (origin, callback) {
        // Cho phép không có origin (như Postman) hoặc các link từ vscode.dev / github.dev
        if (!origin || origin.includes('vscode.dev') || origin.includes('github.dev') || origin === process.env.URL_CLIENTS) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Quan trọng để gửi Cookie/Token
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

dbConnect();
initRoutes(app);

// Cron job giữ nguyên
cron.schedule('0 0 * * *', () => {
    generateDailySessions();
}, { timezone: "Asia/Ho_Chi_Minh" });

// QUAN TRỌNG: Thêm '0.0.0.0' để nhận kết nối từ Port Forwarding
app.listen(port, '0.0.0.0', () => {
    console.log(`Backend chạy tại port ${port} - Mày phải cố lên!!!!`);
});