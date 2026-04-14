const Media = require('../models/Media');
const cloudinaryService = require('./cloudinary.service');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { BadRequestError } = require('../../shared/utils/errorHandler');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('media-service');

class MediaService {
    /**
     * Check if file size is within limits based on user premium status
     */
    validateFileSize(size, isPremium) {
        const maxSize = isPremium 
            ? parseInt(process.env.MAX_FILE_SIZE_B_PREMIUM || '104857600') 
            : parseInt(process.env.MAX_FILE_SIZE_B_NON_PREMIUM || '10485760');
        
        if (size > maxSize) {
            throw new BadRequestError(`File size exceeds limit (${maxSize / 1024 / 1024}MB for ${isPremium ? 'Premium' : 'Standard'} accounts)`);
        }
    }

    /**
     * Upload media
     */
    async uploadMedia(user, file, context = 'chat', ownerId = null, extraData = {}) {
        const { isPremium, id: userId } = user;
        const { isEncrypted = false, fileHash = null, blurhash = null, customThumbnailUrl = null } = extraData;
        
        // 1. Validate size
        this.validateFileSize(file.size, isPremium);

        // 2. Calculate file hash if not provided (for integrity)
        let finalFileHash = fileHash;
        if (!finalFileHash && file.buffer) {
            const crypto = require('crypto');
            finalFileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        }

        // 3. Prepare upload options
        const folder = `chatapp/${context}/${userId}`;
        const resourceType = file.mimetype.startsWith('video') ? 'video' : 
                             file.mimetype.startsWith('audio') ? 'video' : 'auto';
        
        logger.info(`Uploading media for user ${userId}, type: ${file.mimetype}, encrypted: ${isEncrypted}`);

        // 4. Perform upload
        let uploadResult;
        
        if (file.path) {
            uploadResult = await cloudinaryService.uploadLarge(file.path, folder, { 
                resource_type: resourceType,
                original_filename: file.originalname
            });
        } else if (file.buffer) {
            uploadResult = await cloudinaryService.uploadFromBuffer(file.buffer, folder, { 
                resource_type: resourceType,
                original_filename: file.originalname
            });
        } else {
            throw new BadRequestError('Invalid file: Missing buffer or path');
        }

        // 5. Determine media type
        let mediaType = 'other';
        if (file.mimetype.startsWith('image')) mediaType = 'image';
        else if (file.mimetype.startsWith('video')) mediaType = 'video';
        else if (file.mimetype.startsWith('audio')) mediaType = 'voice';
        else if (file.mimetype === 'application/pdf') mediaType = 'document';

        // 6. Handle Thumbnail
        let thumbnailUrl = customThumbnailUrl;
        if (!thumbnailUrl && mediaType === 'image') {
            // Generate standard thumbnail URL from Cloudinary
            thumbnailUrl = uploadResult.secure_url.replace('/upload/', '/upload/w_300,c_scale/');
        } else if (!thumbnailUrl && mediaType === 'video') {
            // Get first frame for video
            thumbnailUrl = uploadResult.secure_url.replace(/\.[^/.]+$/, ".jpg").replace('/upload/', '/upload/w_300,c_scale,so_0/');
        }

        // 7. Save to database
        const media = await Media.create({
            userId,
            type: mediaType,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            context,
            ownerId,
            thumbnailUrl,
            blurhash,
            fileHash: finalFileHash,
            metadata: {
                width: uploadResult.width,
                height: uploadResult.height,
                duration: uploadResult.duration,
                format: uploadResult.format,
                resourceType: uploadResult.resource_type,
                isEncrypted
            }
        });

        // 8. Notify via Kafka
        try {
            const producer = getProducer('media-service');
            await producer.sendMessage(TOPICS.MEDIA_UPLOADED, {
                mediaId: media._id,
                userId: media.userId,
                url: media.url,
                thumbnailUrl: media.thumbnailUrl,
                type: media.type,
                context: media.context,
                ownerId: media.ownerId,
                fileHash: media.fileHash,
                isEncrypted: media.metadata.isEncrypted,
                metadata: media.metadata
            });
            
            // If it's a video or image that's not encrypted, we might want to schedule more processing
            if (!isEncrypted && (mediaType === 'video' || mediaType === 'image')) {
                await producer.sendMessage(TOPICS.MEDIA_PROCESSED, {
                    mediaId: media._id,
                    action: 'SCAN_AND_OPTIMIZE'
                });
            }
        } catch (err) {
            logger.error('Failed to publish Media Kafka events:', err);
        }

        return media;
    }

    /**
     * Delete media
     */
    async deleteMedia(userId, mediaId) {
        const media = await Media.findOne({ _id: mediaId, userId });
        if (!media) throw new BadRequestError('Media not found or permission denied');

        // Delete from Cloudinary
        await cloudinaryService.deleteFile(media.publicId, media.metadata.resourceType || 'image');

        // Mark as deleted in DB (or remove)
        media.isDeleted = true;
        await media.save();

        // Notify via Kafka
        try {
            const producer = getProducer('media-service');
            await producer.sendMessage(TOPICS.MEDIA_DELETED, {
                mediaId: media._id,
                userId: media.userId,
                publicId: media.publicId
            });
        } catch (err) {
            logger.error('Failed to publish MEDIA_DELETED event:', err);
        }

        return { success: true };
    }

    /**
     * Delete media by ownerId (e.g. when story or message is deleted)
     */
    async deleteByOwnerId(ownerId) {
        logger.info(`Requested deletion for all media owned by ${ownerId}`);
        const medias = await Media.find({ ownerId, isDeleted: false });
        
        for (const media of medias) {
            try {
                await cloudinaryService.deleteFile(media.publicId, media.metadata.resourceType || 'image');
                media.isDeleted = true;
                await media.save();
                logger.debug(`Deleted media ${media._id} attached to owner ${ownerId}`);
            } catch (err) {
                logger.error(`Failed to delete media ${media._id}:`, err);
            }
        }
        
        return { count: medias.length };
    }

    /**
     * Delete media by URL
     */
    async deleteByUrl(url) {
        if (!url) return;
        logger.info(`Requested deletion for media with URL ${url}`);
        const media = await Media.findOne({ url, isDeleted: false });
        
        if (media) {
            try {
                await cloudinaryService.deleteFile(media.publicId, media.metadata.resourceType || 'image');
                media.isDeleted = true;
                await media.save();
                logger.debug(`Deleted media ${media._id} found by URL`);
            } catch (err) {
                logger.error(`Failed to delete media ${media._id} by URL:`, err);
            }
        }
        
        return { success: !!media };
    }

    /**
     * Get user media
     */
    async getUserMedia(userId, context, page = 1, limit = 20) {
        const query = { userId, isDeleted: false };
        if (context) query.context = context;

        const media = await Media.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Media.countDocuments(query);

        return { media, total };
    }
}

module.exports = new MediaService();
