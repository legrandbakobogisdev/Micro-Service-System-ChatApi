const Story = require('../models/Story');
const StoryView = require('../models/StoryView');
const asyncHandler = require('../../shared/utils/asyncHandler');
const ApiResponse = require('../../shared/utils/response');
const { getProducer } = require('../../shared/kafka-config/producer');
const { TOPICS } = require('../../shared/kafka-config/topics');
const { createLogger } = require('../../shared/utils/logger');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../shared/utils/errorHandler');

const logger = createLogger('story-service');

/**
 * @desc Create a new story
 * @route POST /api/stories
 * @access Private
 */
exports.createStory = asyncHandler(async (req, res) => {
    const { type, content, mediaParams } = req.body;
    const userId = req.user.id;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = await Story.create({
        userId,
        type,
        content,
        mediaParams,
        expiresAt
    });

    logger.info(`New story created by ${userId} (ID: ${story._id})`);

    // Publish to Kafka so other services (e.g. Chat/Socket) can notify contacts
    try {
        const producer = getProducer('story-service');
        await producer.sendMessage(TOPICS.STORY_CREATED, {
            storyId: story._id,
            userId,
            type,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt
        });
    } catch (error) {
        logger.error('Failed to publish STORY_CREATED event:', error);
    }

    return ApiResponse.success(res, story, 'Story created successfully', 201);
});

/**
 * @desc Get active stories
 * @route GET /api/stories/active
 * @access Private
 */
exports.getActiveStories = asyncHandler(async (req, res) => {
    // In a real WhatsApp-like app, we should filter by users that are in the user's contact list
    // As an MVP, we can allow passing a list of friend IDs or fetch generic active stories
    const { authorIds } = req.query; // Comma-separated user IDs

    let query = { expiresAt: { $gt: new Date() } };

    if (authorIds) {
        query.userId = { $in: authorIds.split(',') };
    }

    const stories = await Story.find(query).sort({ userId: 1, createdAt: 1 });

    // Group stories by userId
    const groupedStories = stories.reduce((acc, story) => {
        if (!acc[story.userId]) {
            acc[story.userId] = [];
        }
        acc[story.userId].push(story);
        return acc;
    }, {});

    const result = Object.keys(groupedStories).map(authorId => ({
        userId: authorId,
        stories: groupedStories[authorId]
    }));

    return ApiResponse.success(res, result, 'Active stories retrieved successfully');
});

/**
 * @desc Mark a story as viewed
 * @route POST /api/stories/:storyId/view
 * @access Private
 */
exports.viewStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const viewerId = req.user.id;

    const story = await Story.findById(storyId);
    if (!story) throw new NotFoundError('Story not found or expired');
    
    // Prevent creator from counting as a view
    if (story.userId.toString() === viewerId) {
        return ApiResponse.success(res, null, 'Story viewer is creator, not counting');
    }

    try {
        await StoryView.create({
            storyId,
            viewerId
        });

        // Increment view count
        story.viewCount += 1;
        await story.save();

        // Publish to Kafka so creators get real-time view updates
        const producer = getProducer('story-service');
        await producer.sendMessage(TOPICS.STORY_VIEWED, {
            storyId,
            authorId: story.userId,
            viewerId,
            viewedAt: new Date()
        });
    } catch (error) {
        // MongoServerError E11000 duplicate key error means it was already viewed
        if (error.code === 11000) {
            return ApiResponse.success(res, null, 'Story already viewed');
        }
        throw error;
    }

    return ApiResponse.success(res, null, 'Story marked as viewed');
});

/**
 * @desc Get viewers for a status (Creator only)
 * @route GET /api/stories/:storyId/viewers
 * @access Private
 */
exports.getStoryViewers = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await Story.findById(storyId);
    if (!story) throw new NotFoundError('Story not found');

    if (story.userId.toString() !== userId) {
        throw new ForbiddenError('You can only see viewers for your own stories');
    }

    const viewers = await StoryView.find({ storyId }).sort({ viewedAt: -1 });
    
    return ApiResponse.success(res, viewers, 'Viewers retrieved');
});

/**
 * @desc Delete a story manually
 * @route DELETE /api/stories/:storyId
 * @access Private
 */
exports.deleteStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await Story.findById(storyId);
    if (!story) throw new NotFoundError('Story not found');

    if (story.userId.toString() !== userId) {
        throw new ForbiddenError('You can only delete your own stories');
    }

    await Story.findByIdAndDelete(storyId);
    await StoryView.deleteMany({ storyId });

    // Publish to Kafka deletion event
    try {
        const producer = getProducer('story-service');
        await producer.sendMessage(TOPICS.STORY_DELETED, {
            storyId,
            userId
        });
    } catch (error) {
        logger.error('Failed to publish STORY_DELETED event:', error);
    }

    return ApiResponse.success(res, null, 'Story deleted');
});
