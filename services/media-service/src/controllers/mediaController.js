const fs = require('fs');
const mediaService = require('../services/media.service');
const ApiResponse = require('../../shared/utils/response');
const asyncHandler = require('../../shared/utils/asyncHandler');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('media-service');

/**
 * Handle media upload
 */
exports.uploadMedia = asyncHandler(async (req, res) => {
    if (!req.file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
    }

    try {
        const { 
            context = 'chat', 
            ownerId,
            isEncrypted,
            fileHash,
            blurhash,
            customThumbnailUrl
        } = req.body;

        const extraData = {
            isEncrypted: isEncrypted === 'true' || isEncrypted === true,
            fileHash,
            blurhash,
            customThumbnailUrl
        };

        const media = await mediaService.uploadMedia(req.user, req.file, context, ownerId, extraData);
        
        // Cleanup file from disk asynchronously
        if (req.file.path) {
            fs.unlink(req.file.path, (err) => {
                if (err) logger.error(`Failed to delete temp file ${req.file.path}:`, err);
            });
        }

        return ApiResponse.created(res, media, 'File uploaded successfully');
    } catch (error) {
        // Cleanup if error
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, () => {});
        }
        throw error;
    }
});

/**
 * Handle multiple media uploads
 */
exports.uploadMultipleMedia = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return ApiResponse.error(res, 'No files uploaded', 400);
    }

    const { context = 'chat', ownerId, isEncrypted } = req.body;
    const results = [];
    
    for (const file of req.files) {
        try {
            const extraData = {
                isEncrypted: isEncrypted === 'true' || isEncrypted === true
            };
            const media = await mediaService.uploadMedia(req.user, file, context, ownerId, extraData);
            results.push(media);
            
            // Cleanup file from disk
            if (file.path) {
                fs.unlink(file.path, () => {});
            }
        } catch (error) {
            logger.error(`Error uploading file ${file.originalname}:`, error);
            if (file.path) {
                fs.unlink(file.path, () => {});
            }
            throw error; 
        }
    }

    return ApiResponse.created(res, results, `${results.length} files uploaded successfully`);
});

/**
 * Get user media history
 */
exports.getUserMedia = asyncHandler(async (req, res) => {
    const { context, page = 1, limit = 20 } = req.query;
    const { media, total } = await mediaService.getUserMedia(req.user.id, context, parseInt(page), parseInt(limit));
    
    return ApiResponse.paginated(res, media, page, limit, total, 'Media retrieved successfully');
});

/**
 * Delete media
 */
exports.deleteMedia = asyncHandler(async (req, res) => {
    const { mediaId } = req.params;
    await mediaService.deleteMedia(req.user.id, mediaId);
    
    return ApiResponse.success(res, null, 'Media deleted successfully');
});

/**
 * Check limits (handy for frontend to know before starting upload)
 */
exports.getUploadLimits = asyncHandler(async (req, res) => {
    const isPremium = req.user.isPremium;
    const limits = {
        maxFileSize: isPremium 
            ? parseInt(process.env.MAX_FILE_SIZE_B_PREMIUM || '104857600') 
            : parseInt(process.env.MAX_FILE_SIZE_B_NON_PREMIUM || '10485760'),
        allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/*,video/*').split(','),
        isPremium
    };
    
    return ApiResponse.success(res, limits, 'Upload limits retrieved');
});
