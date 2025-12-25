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

// Cấu hình CORS linh hoạt cho Production và Dev Tunnel
app.use(cors({
    origin: function (origin, callback) {
        // 1. Cho phép không có origin (như Postman hoặc các thiết bị mobile cũ)
        // 2. Cho phép domain chính thức từ biến môi trường
        // 3. Cho phép các domain tạm thời từ VS Code Tunnel (*.devtunnels.ms và *.vscode.dev)
        if (!origin || 
            origin === process.env.URL_CLIENTS || 
            origin.includes('vscode.dev') || 
            origin.includes('github.dev') || 
            origin.includes('devtunnels.ms')) {
            callback(null, true);
        } else {
            console.log("CORS bị từ chối cho origin:", origin); // Log để kiểm tra nếu vẫn lỗi
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true, // Bắt buộc để nhận Cookie/Token từ Frontend
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

dbConnect();
initRoutes(app);

cron.schedule('* * * * *', async () => {
    try {
        await generateDailySessions();
    } catch (err) {
    }
}, { 
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh" 
});

// QUAN TRỌNG: Render tự động gán PORT qua biến môi trường
app.listen(port, '0.0.0.0', () => {
    console.log(`Backend chạy tại port ${port} - Mày phải cố lên!!!!`);
});