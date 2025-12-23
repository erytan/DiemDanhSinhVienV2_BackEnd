const router = require("express").Router();
const ctrls = require('../controllers/mission')
const { verifyAccessToken, isAdmin, validateEvent } = require('../middlewares/verifyToken');

router.post("/create", [verifyAccessToken, isAdmin, validateEvent], ctrls.createMission)
router.get("/:id", [verifyAccessToken, isAdmin], ctrls.getMissionByID)
router.put("/:id", [verifyAccessToken, isAdmin, validateEvent], ctrls.updateMission)
router.delete("/:id", [verifyAccessToken, isAdmin], ctrls.deleteMission)

router.get("/", [verifyAccessToken, isAdmin], ctrls.getAllMission)
module.exports = router