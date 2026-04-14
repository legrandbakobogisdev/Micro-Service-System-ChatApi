const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('media-service');

class CloudinaryService {
    /**
     * Upload a file using stream (good for small to medium files)
     */
    async uploadFromBuffer(buffer, folder, options = {}) {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder, ...options },
                (error, result) => {
                    if (error) {
                        logger.error('Cloudinary upload error:', error);
                        return reject(error);
                    }
                    resolve(result);
                }
            );
            streamifier.createReadStream(buffer).pipe(uploadStream);
        });
    }

    /**
     * Upload a large file in chunks (native Cloudinary chunked upload)
     * This is useful if the server already has the file or a stream
     */
    async uploadLarge(filePath, folder, options = {}) {
        try {
            const result = await cloudinary.uploader.upload(filePath, {
                folder,
                resource_type: 'auto',
                chunk_size: 6000000, // 6MB chunks
                ...options
            });
            return result;
        } catch (error) {
            logger.error('Cloudinary large upload error:', error);
            throw error;
        }
    }

    /**
     * Delete a file from Cloudinary
     */
    async deleteFile(publicId, resourceType = 'image') {
        try {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            return result;
        } catch (error) {
            logger.error('Cloudinary delete error:', error);
            throw error;
        }
    }

    /**
     * Get video duration if needed
     */
    async getMetadata(publicId, resourceType = 'video') {
        try {
            const result = await cloudinary.api.resource(publicId, { resource_type: resourceType });
            return result;
        } catch (error) {
            logger.error('Cloudinary metadata error:', error);
            throw error;
        }
    }
}

module.exports = new CloudinaryService();
