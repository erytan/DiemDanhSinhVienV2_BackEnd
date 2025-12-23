const router = require('express').Router();
const ctrls = require('../controllers/document');
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const { verifyAccessToken, isAdmin, } = require('../middlewares/verifyToken');

router.post('/createDocument', [verifyAccessToken, isAdmin, upload.array('files', 10)], ctrls.createDocument);
router.get('/student',[verifyAccessToken],ctrls.getDocumentsForStudent);
router.get('/viewdocument/:id', [verifyAccessToken], ctrls.getDocumentView)
router.get('/documentfirst', [verifyAccessToken], ctrls.getFirstFourDocument);
router.get('/:class_id', [verifyAccessToken], ctrls.getDocumentsByClassId);
router.get('/', [verifyAccessToken, isAdmin], ctrls.getAllDocuments);
router.put('/:id', [verifyAccessToken, isAdmin, upload.array('files', 10)], ctrls.updateDocument);
router.delete('/:id', [verifyAccessToken, isAdmin], ctrls.deleteDocument);
module.exports = router;