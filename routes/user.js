const router = require('express').Router()
const ctrls = require('../controllers/user')
const { verifyAccessToken, isAdmin } = require('../middlewares/verifyToken')


router.post('/login', ctrls.login)
router.post('/register', ctrls.register); // Thêm dòng này
router.get('/current', [verifyAccessToken, isAdmin], ctrls.getCurrent)
router.get('/logout', ctrls.logout)
router.post('/forgetpassword', ctrls.forgetPassword)
router.put('/resetpassword', ctrls.resetPassword)
router.put('/:uid', [verifyAccessToken, isAdmin], ctrls.updateUser)
router.get('/getAll', [verifyAccessToken, isAdmin], ctrls.getAllUser)
router.get('/', [verifyAccessToken, isAdmin], ctrls.getUser)

module.exports = router