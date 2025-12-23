const router = require('express').Router()
const ctrls = require('../controllers/class')
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { verifyAccessToken, isAdmin, validateClassCreation, validateClassCreation1 } = require('../middlewares/verifyToken')

router.post('/createClass', [verifyAccessToken, validateClassCreation, isAdmin], ctrls.createClass)
router.put('/:class_id', [verifyAccessToken, isAdmin], ctrls.updateClass)
router.delete('/:class_id', [verifyAccessToken, isAdmin], ctrls.deleteClass)
router.get('/', [verifyAccessToken, isAdmin], ctrls.getAllClasses);
router.post('/create-class', upload.single('file'), [verifyAccessToken, isAdmin, validateClassCreation1], ctrls.createClassAddExcel);
router.get("/stats/class/:class_id", [verifyAccessToken], ctrls.getStudentCourseStats);
router.get("/getClassByUser", [verifyAccessToken], ctrls.getClassByUserInClass)

router.get('/names', [verifyAccessToken, isAdmin], ctrls.getAllClassesOnlyName)
router.get('/:class_id', [verifyAccessToken, isAdmin], ctrls.getSingleClass);
router.get("/:class_id/check-delete", [verifyAccessToken, isAdmin], ctrls.checkClassDelete)
module.exports = router;