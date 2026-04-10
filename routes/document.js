const router = require('express').Router();
const ctrls = require('../controllers/document');
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const { verifyAccessToken, isAdmin, checkAccountStatus } = require('../middlewares/verifyToken');

router.post('/createDocument', [verifyAccessToken, isAdmin, checkAccountStatus, upload.array('files', 10)], ctrls.createDocument);
router.get('/student', [verifyAccessToken], ctrls.getDocumentsForStudent);
router.get('/viewdocument/:id', [verifyAccessToken], ctrls.getDocumentView)
router.get('/documentfirst', [verifyAccessToken, checkAccountStatus], ctrls.getFirstFourDocument);
router.get('/:class_id', [verifyAccessToken, checkAccountStatus], ctrls.getDocumentsByClassId);
router.get('/', [verifyAccessToken, isAdmin, checkAccountStatus], ctrls.getAllDocuments);
router.put('/:id', [verifyAccessToken, isAdmin, upload.array('files', 10)], ctrls.updateDocument);
router.delete('/:id', [verifyAccessToken, isAdmin, checkAccountStatus], ctrls.deleteDocument);
module.exports = router;