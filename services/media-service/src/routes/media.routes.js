const express = require('express');
const multer = require('multer');
const mediaController = require('../controllers/mediaController');
const { authenticate } = require('../middlewares/auth');
const { BadRequestError } = require('../../shared/utils/errorHandler');

const router = express.Router();

const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        // We set a high limit here but validate precisely in the service based on premium status
        fileSize: 110 * 1024 * 1024 // 110MB absolute max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '').split(',');
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
            return cb(new BadRequestError(`File type ${file.mimetype} not allowed`), false);
        }
        cb(null, true);
    }
});

const { validate, uploadValidator } = require('../middlewares/validators');

// All routes require authentication
router.use(authenticate);

// Upload routes
router.post('/upload', upload.single('file'), validate(uploadValidator), mediaController.uploadMedia);
router.post('/upload/multiple', upload.array('files', 10), validate(uploadValidator), mediaController.uploadMultipleMedia);

// Management routes
router.get('/my-media', mediaController.getUserMedia);
router.get('/limits', mediaController.getUploadLimits);
router.delete('/:mediaId', mediaController.deleteMedia);

module.exports = router;
