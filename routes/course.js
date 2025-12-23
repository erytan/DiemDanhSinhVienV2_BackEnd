const router = require('express').Router()
const ctrls = require('../controllers/course')
const { verifyAccessToken, isAdmin } = require('../middlewares/verifyToken')

router.post("/create", [verifyAccessToken, isAdmin], ctrls.createCourse);
router.get("/", [verifyAccessToken,isAdmin],ctrls.getAllCourses)
router.get("/:cid",[verifyAccessToken,isAdmin],ctrls.getCourse)
router.put("/:cid",[verifyAccessToken,isAdmin],ctrls.updateCourse )
router.delete('/:course_id',[verifyAccessToken,isAdmin],ctrls.deleteCourse)
module.exports = router;