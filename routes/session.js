const router = require('express').Router()
const ctrls = require('../controllers/session')
const {verifyAccessToken, isAdmin } = require('../middlewares/verifyToken');

router.post ("/create",[verifyAccessToken,isAdmin],ctrls.createSession);
router.get("/today",verifyAccessToken,ctrls.getTodaySessionByUser);
router.get("/",[verifyAccessToken,isAdmin],ctrls.getAllSession);
router.get("/:session_id",[verifyAccessToken,isAdmin],ctrls.getSession);
router.put("/:session_id",[verifyAccessToken,isAdmin],ctrls.updateSession);
router.delete("/:session_id",[verifyAccessToken,isAdmin],ctrls.deleteSession);
router.post ("/:session_id/generate-qr",[verifyAccessToken,isAdmin],ctrls.generateQrCode);
router.patch("/:session_id/attend",[verifyAccessToken],ctrls.checkAttendance);
module.exports = router;