const jwt = require('jsonwebtoken');
const Joi = require('joi');
const asyncHandler = require('express-async-handler');
const User = require('../models/user'); // Giả sử bạn có model User

const validateClassCreation = asyncHandler(async (req, res, next) => {
  // Định nghĩa schema validation
  const classSchema = Joi.object({
    class_name: Joi.string().required(),
    course_ids: Joi.array().items(Joi.string()).min(1).required(),
    students: Joi.array().items(Joi.string()), // không bắt buộc
    weeks: Joi.number().min(1).required(),
    schedule: Joi.array().items(
      Joi.object({
        dayOfWeek: Joi.number().min(0).max(6).required(),
        time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
      })
    ).required()
  });
  const { error } = classSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  next();
})
const validateEvent = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().trim().required(),
    start: Joi.date().required(),
    end: Joi.date().optional(),
    extendedProps: Joi.object({
      calendar: Joi.string()
        .valid("Danger", "Success", "Primary", "Warning")
        .required(),
      description: Joi.string().allow(""),
      location: Joi.string().allow(""),
    }).required()
  }).unknown(true);   // ⬅️ CHO PHÉP FIELD THỪA (KHÔNG BẮT BUỘC)

  const { error } = schema.validate(req.body, { abortEarly: true });

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message,
    });
  }

  next();
};

const validateClassCreation1 = (req, res, next) => {
  try {
    // Nếu dùng FormData, tất cả các field đều là string
    let data = req.body;

    if (data.classData) {
      // parse JSON string thành object
      data = JSON.parse(data.classData);
    }

    let { class_name, course_ids, weeks, schedule } = data;

    // Nếu course_ids hoặc schedule là string JSON, parse tiếp
    if (typeof course_ids === 'string') course_ids = JSON.parse(course_ids);
    if (typeof schedule === 'string') schedule = JSON.parse(schedule);
    weeks = Number(weeks);

    const schema = Joi.object({
      class_name: Joi.string().trim().required().messages({
        'any.required': 'class_name là bắt buộc',
        'string.empty': 'class_name không được để trống',
      }),
      course_ids: Joi.array().items(Joi.string().trim()).min(1).required().messages({
        'any.required': 'course_ids là bắt buộc',
        'array.min': 'Phải chọn ít nhất 1 khóa học',
      }),
      students: Joi.array().items(Joi.string().trim()).default([]),
      weeks: Joi.number().min(1).required().messages({
        'any.required': 'weeks là bắt buộc',
        'number.min': 'Số tuần phải lớn hơn 0',
      }),
      schedule: Joi.array()
        .items(
          Joi.object({
            dayOfWeek: Joi.number().min(0).max(6).required().messages({
              'any.required': 'dayOfWeek là bắt buộc',
              'number.min': 'dayOfWeek không hợp lệ',
              'number.max': 'dayOfWeek không hợp lệ',
            }),
            time: Joi.string()
              .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
              .required()
              .messages({
                'any.required': 'time là bắt buộc',
                'string.pattern.base': 'time phải theo định dạng HH:mm',
              }),
          })
        )
        .min(1)
        .required()
        .messages({
          'any.required': 'schedule là bắt buộc',
          'array.min': 'schedule phải có ít nhất 1 buổi học',
        }),
    });

    const { error } = schema.validate({ class_name, course_ids, weeks, schedule }, { abortEarly: true });
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    // Gán lại req.body đã chuẩn hóa
    req.body = { class_name, course_ids, weeks, schedule };

    next();
  } catch (err) {
    return res.status(400).json({ success: false, error: "Dữ liệu gửi lên không hợp lệ" });
  }
};

const verifyAccessToken = asyncHandler(async (req, res, next) => {
  // 1. Rút gọn điều kiện bằng Optional Chaining (?.)
  if (req?.headers?.authorization?.startsWith('Bearer')) {
    const token = req.headers.authorization.split(' ')[1];

    // Dùng try-catch với jwt.verify để xử lý bất đồng bộ tốt hơn
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 2. Lỗ hổng bảo mật được khắc phục:
      // Kiểm tra xem người dùng từ token có thực sự tồn tại trong DB không
      const user = await User.findById(decoded._id).select('role firstname lastname user_id');
      if (!user) {
        return res.status(401).json({
          success: false,
          mes: "User not found, token is invalid."
        });
      }

      req.user = user; // Gán đối tượng user từ DB vào req
      next();

    } catch (error) {
      // Xử lý lỗi từ jwt.verify (token hết hạn, sai chữ ký)
      return res.status(401).json({
        success: false,
        mes: "Invalid or expired access token."
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      mes: "Authentication required!"
    });
  }
});

const isAdmin = asyncHandler(async (req, res, next) => {
  // 3. Khắc phục lỗi crash: Luôn kiểm tra sự tồn tại của req.user
  if (!req.user) {
    return res.status(401).json({
      success: false,
      mes: 'Authentication failed, user not found.'
    });
  }

  // 4. Tránh Magic Number: Giả sử role admin là 'admin' thay vì '1'
  // Điều này cần đồng bộ với dữ liệu trong database của bạn
  const { role } = req.user;
  if (role !== '1') {
    // 5. Dùng đúng Status Code: 403 Forbidden cho lỗi phân quyền
    return res.status(403).json({
      success: false,
      mes: 'Access denied. Admin role required.'
    });
  }
  next();
});

module.exports = {
  verifyAccessToken,
  isAdmin,
  validateClassCreation,
  validateClassCreation1,
  validateEvent
};