  const User = require("../models/user")
const bcrypt = require('bcrypt');
const asyncHandler = require("express-async-handler");
const path = require("path");
const {
    generateAccessToken,
    generateRefreshToken,
} = require("../middlewares/jwt")
const sendMail = require("../ultils/sendMail");

const login = asyncHandler(async (req, res) => {
    const { email, password, deviceId } = req.body;
    const COOLDOWN_MINUTES = 0; // Đặt thời gian cooldown (phút)

    if (!email || !password || !deviceId) {
        return res.status(400).json({ success: false, mess: "Missing required fields" });
    }

    // 🔑 BƯỚC 1: Kiểm tra Cooldown thiết bị
    const cooldownUser = await User.findOne(
        { "deviceSessions.deviceId": deviceId },
        { "deviceSessions": { $elemMatch: { deviceId: deviceId, lastLogout: { $ne: null } } } }
    );

    if (cooldownUser && cooldownUser.deviceSessions.length > 0) {
        const deviceSession = cooldownUser.deviceSessions[0];
        const lastLogoutTime = deviceSession.lastLogout.getTime();

        // Tính toán thời gian đã trôi qua (bằng milliseconds)
        const timeElapsedMs = Date.now() - lastLogoutTime;

        // Tổng thời gian cooldown (bằng milliseconds)
        const totalCooldownMs = COOLDOWN_MINUTES * 60 * 1000;

        // Thời gian còn lại (bằng milliseconds)
        const timeRemainingMs = totalCooldownMs - timeElapsedMs;

        // Kiểm tra nếu thời gian còn lại > 0
        if (timeRemainingMs > 0) {

            let mess = "";

            // Nếu còn DƯỚI 1 PHÚT (60000 ms)
            if (timeRemainingMs < 60000) {
                const timeLeftSeconds = Math.ceil(timeRemainingMs / 1000); // Làm tròn lên giây gần nhất
                mess = `Thiết bị này đang bị khóa. Vui lòng chờ ${timeLeftSeconds} giây trước khi đăng nhập lại.`;
            } else {
                // Nếu còn 1 phút trở lên, đếm bằng phút
                const timeLeftMinutes = Math.ceil(timeRemainingMs / 60000); // Làm tròn lên phút gần nhất
                mess = `Thiết bị này đang bị khóa. Vui lòng chờ ${timeLeftMinutes} phút trước khi đăng nhập lại.`;
            }

            // Chặn đăng nhập: Áp dụng cho BẤT KỲ tài khoản nào
            return res.status(403).json({
                success: false,
                mess: mess
            });
        }
    }
    // Hết BƯỚC 1

    // BƯỚC 2: Tiến hành xác thực người dùng (Giữ nguyên)
    const user = await User.findOne({ email });
    if (!user || !(await user.isCorrectPassword(password))) {
        throw new Error("Invalid credentials");
    }

    // --- BƯỚC 3 & 4: Cập nhật Session, Token, và Cookie (Giữ nguyên) ---
    // ... (logic tạo token, cập nhật deviceSessions, và user.save() ở đây)
    const device = user.deviceSessions?.find(d => d.deviceId === deviceId);

    const { password: pwd, refreshToken, passwordResetOTP, ...userData } = user.toObject();
    userData.role = user.role;

    const accessToken = generateAccessToken(user._id, user.role, user.user_id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;

    if (device) {
        device.lastLogout = null;
    } else {
        user.deviceSessions.push({ deviceId, lastLogout: null });
    }

    await user.save();

    // BƯỚC 4: Lưu cookie (Cần kiểm tra lại tùy chọn secure/sameSite theo môi trường)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/',
    };

    res.cookie("refreshToken", newRefreshToken, cookieOptions);
    res.cookie("deviceId", deviceId, cookieOptions);

    return res.status(200).json({
        success: true,
        accessToken,
        userData
    });
});

const register = asyncHandler(async (req, res) => {
    const { email, password, firstname, lastname, user_id, mobile } = req.body;

    if (!email || !password || !firstname || !lastname || !user_id || !mobile) {
        return res.status(400).json({ success: false, mess: "Missing required fields." });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { user_id }, { mobile }] });

    if (existingUser) {
        let message = "An account with this information already exists.";
        if (existingUser.email === email) message = "Email is already taken.";
        else if (existingUser.user_id === user_id) message = "User ID is already taken.";
        else if (existingUser.mobile === mobile) message = "Mobile number is already taken.";
        return res.status(409).json({ success: false, mess: message });
    }

    // ✅ AN TOÀN: Chỉ tạo user với các trường được chỉ định, bỏ qua các trường khác (như 'role')
    const newUser = await User.create({
        email,
        password,
        firstname,
        lastname,
        user_id,
        mobile
    });

    // ✅ TRẢ VỀ DỮ LIỆU AN TOÀN: Không bao giờ trả về mật khẩu đã băm
    return res.status(201).json({ // Dùng 201 Created
        success: true,
        mess: "Registration successful!",
        user: {
            _id: newUser._id,
            user_id: newUser.user_id,
            firstname: newUser.firstname,
            lastname: newUser.lastname,
            email: newUser.email,
            role: newUser.role
        }
    });
});
const getCurrent = asyncHandler(async (req, res) => {
    const { _id } = req.user;
    const user = await User.findById(_id).select("-refreshToken -password -passwordResetOTP ");
    return res.status(200).json({
        success: user ? true : false,
        rs: user ? user : "User not found",
    });
});
const getUser = asyncHandler(async (req, res) => {

    // --- KHỞI TẠO PHÂN TRANG VÀ GIỚI HẠN ---
    const page = parseInt(req.query.page?.toString() || '1');
    const limit = parseInt(req.query.limit?.toString() || '15');
    const skip = (page - 1) * limit;

    // --- XỬ LÝ TÌM KIẾM (SEARCH) ---
    let searchCondition = {};
    if (req.query.search) {
        const searchTerm = req.query.search.toString();
        // Tìm kiếm trên các trường: firstname, lastname, user_id
        searchCondition = {
            $or: [
                // Sử dụng $regex và $options: 'i' để tìm kiếm không phân biệt chữ hoa/chữ thường
                { firstname: { $regex: searchTerm, $options: 'i' } },
                { lastname: { $regex: searchTerm, $options: 'i' } },
                { user_id: { $regex: searchTerm, $options: 'i' } },
            ]
        };
    }

    try {
        // 1. Đếm TỔNG số lượng tài liệu khớp với điều kiện tìm kiếm/lọc
        // Đây là cách chính xác để tính tổng số lượng item sau khi áp dụng search
        const totalItems = await User.countDocuments(searchCondition);
        const totalPages = Math.ceil(totalItems / limit);

        // 2. Query cơ sở dữ liệu cho trang hiện tại
        const response = await User.find(searchCondition)
            .select("-refreshToken -password") // Loại bỏ các trường nhạy cảm
            .skip(skip) // Bỏ qua số lượng item
            .limit(limit) // Giới hạn số lượng item trên trang
            .exec(); // Thực thi Query

        // 3. Trả về phản hồi đầy đủ
        return res.status(200).json({
            success: true,
            data: response,
            pagination: {
                page: page,
                limit: limit,
                total: totalItems,
                totalPages: totalPages,
            }
        });

    } catch (error) {
        console.error("Lỗi server khi lấy dữ liệu người dùng:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy dữ liệu người dùng",
            error: error.message,
        });
    }
});
const getAllUser = asyncHandler(async (req, res) => {
    const response = await User.find().select("user_id");
    return res.status(200).json({
        success: response ? true : false,
        data: response,
    });
})
const logout = asyncHandler(async (req, res) => {
    // Lấy cả refreshToken và deviceId (để có thể xóa chúng)
    const { refreshToken, deviceId } = req.cookies;

    // --- Hàm tiện ích để xóa cookie ---
    const clearCookies = (res) => {
        const isProduction = process.env.NODE_ENV === 'production';

        // Tùy chọn cơ bản (dùng cho cả hai cookie)
        const baseCookieOptions = {
            httpOnly: true,
            secure: isProduction,
            path: '/',
        };

        // Tùy chọn cho deviceId (cần sameSite nghiêm ngặt hơn)
        const deviceCookieOptions = {
            ...baseCookieOptions,
            sameSite: isProduction ? 'strict' : 'lax',
        };

        // ✅ KHẮC PHỤC LỖI CÚ PHÁP VÀ THÊM LẠI LOGIC XÓA REFRESH TOKEN
        res.clearCookie("refreshToken", baseCookieOptions);

    };

    // --- BƯỚC 1: Xử lý trường hợp thiếu deviceId ---
    if (!deviceId) {
        clearCookies(res);
        return res.status(200).json({ success: true, mess: "Logout successfully (No deviceId provided)." });
    }

    // --- BƯỚC 2: Cập nhật DB bằng deviceId ---
    try {
        // Cập nhật lastLogout (chỉ tìm kiếm bằng deviceId)
        const updateResult = await User.findOneAndUpdate(
            {
                "deviceSessions.deviceId": deviceId,
            },
            {
                $set: {
                    // Giữ nguyên việc KHÔNG vô hiệu hóa refreshToken chung
                    "deviceSessions.$.lastLogout": new Date(),
                },
            },
            {
                new: true,
            }
        );
    } catch (error) {
        return res.status(500).json({ success: false, mess: "Internal Server Error during session cleanup. Check server logs." });
    }

    // --- BƯỚC 3: Xóa cookie và trả về thành công ---
    clearCookies(res);

    return res.status(200).json({
        success: true,
        mess: "Logout successful, session invalidated."
    });
});
const updateUser = asyncHandler(async (req, res) => {
    const { uid } = req.params;
    const updateData = req.body;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            success: false,
            mess: "No data provided for update."
        });
    }
    const updateUser = await User.findOneAndUpdate(
        { _id: uid },
        updateData,
        { new: true, runValidators: true }
    )
    if (!updateUser) {
        return res.status(404).json({
            success: false,
            mess: `User with ID '${_id}' not found. `
        });
    }
    res.status(200).json({
        success: true,
        mess: "Update user successfully",
        data: updateUser
    });
});
//client gửi gmail
//Server check email có hợp lệ hay không => gửi gmail + kèm theo( password change OTP)
//Client check email
//Client gửi OTP
//Check OTP có giống với OTP mà server gửi qua email hay không
//Change pasword
//---- Tạo otp ----//
const generateOTP = () => {
    return Math.floor(10000 + Math.random() * 900000).toString();
};
const forgetPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({
            success: false,
            mes: "Missing email",
        });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                mes: "User not found",
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Hash OTP
        const salt = bcrypt.genSaltSync(10);
        const hashedOTP = bcrypt.hashSync(otp, salt);

        // Save hashed OTP & expiry
        user.passwordResetOTP = hashedOTP;
        user.passwordResetExpires = otpExpiry;
        await user.save();

        // Email HTML with logo
        const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
        
        <!-- Header -->
        <div style="background-color: #0F172A; color: #fff; text-align: center; padding: 30px 20px;">
          <img src="cid:logo" alt="EryTan Logo" style="width: 50px; height: 50px; object-fit: contain;" />
          <h2 style="margin: 0; font-size: 22px;">Password Reset Request</h2>
        </div>

        <!-- Body -->
        <div style="padding: 25px;">
          <p style="color: #333; font-size: 16px; margin: 0 0 10px;">Hello <strong>${user.firstname} ${user.lastname}</strong>,</p>
          <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 15px;">
            You requested to reset your password. Please use the OTP code below to proceed:
          </p>

          <!-- OTP Box -->
          <div style="text-align: center; margin: 25px 0;">
            <div style="display: inline-block; font-size: 26px; font-weight: bold; letter-spacing: 4px; padding: 15px 25px; background: #F3F4F6; border: 2px dashed #4F46E5; border-radius: 8px; color: #111;">
              ${otp}
            </div>
            <p style="font-size: 13px; color: #777; margin-top: 10px;">This OTP will expire in <strong>15 minutes</strong>.</p>
          </div>

          <p style="color: #555; font-size: 15px; margin: 0 0 20px;">
            If you did not request this, you can safely ignore this email.
          </p>

          <!-- Signature -->
          <p style="color: #4F46E5; font-weight: 600; font-size: 15px; margin-top: 25px;">EryTan</p>
        </div>

        <!-- Footer -->
        <div style="background: #F9FAFB; text-align: center; padding: 15px; font-size: 13px; color: #888;">
          © ${new Date().getFullYear()} EryTan. All rights reserved.
        </div>
      </div>
    `;

        // Send email
        const data = {
            email,
            subject: "EryTan Password Reset OTP",
            html,
            attachments: [
                {
                    filename: "Logo.png",
                    path: path.join(__dirname, "../design/Logo.png"), // 👉 thay bằng đường dẫn thật đến logo của bạn
                    cid: "logo", // phải trùng với src="cid:logo" trong HTML
                },
            ],
        };
        console.log("Email size:", html.length, "bytes");
        const rs = await sendMail(data);

        return res.status(200).json({
            success: true,
            mes: rs.response?.includes("OK")
                ? "Check your email for OTP."
                : "Something went wrong. Please try again!",
        });
    } catch (err) {
        console.error("Error occurred:", err);
        return res.status(500).json({
            success: false,
            mes: "Something went wrong. Please try again!",
        });
    }
});
const resetPassword = asyncHandler(async (req, res) => {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
        return res.status(400).json({
            success: false,
            mes: "Missing input"
        });
    }
    try {
        const user = await User.findOne({
            email,
            passwordResetExpires: { $gt: Date.now() },
        });
        if (!user) {
            return res
                .status(400)
                .json({
                    success: false, mes: " Invalid or expired OTP"
                });
        }
        user.password = password
        user.passwordResetOTP = undefined;
        user.passwordResetExpires = undefined;
        user.passwordChangeAt = Date.now();

        await user.save();
        return res.status(200).json({
            success: true,
            mes: "Password update successfully",
        });
    } catch (error) {
        console.error("Error occurred:", error);
        return res
            .status(500)
            .json({
                success: false,
                mes: "Something went wrong. Please try again!!",
            })
    }
})

module.exports = {
    login,
    register,
    getCurrent,
    logout,
    forgetPassword,
    resetPassword,
    getUser,
    updateUser,
    getAllUser,
}
