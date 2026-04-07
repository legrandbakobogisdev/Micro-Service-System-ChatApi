const express = require('express');
const storyController = require('../controllers/storyController');
const { createStoryValidation } = require('../middlewares/validators');

// Note: Ensure an authentication middleware is implemented
// Since this is isolated, we can copy the JWT auth middleware from chat-service
// For now, I'll import it from the structure
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

// Story retrieval
router.get('/active', storyController.getActiveStories);

// Story creation, view and deletion
router.post('/', createStoryValidation, storyController.createStory);
router.post('/:storyId/view', storyController.viewStory);
router.get('/:storyId/viewers', storyController.getStoryViewers);
router.delete('/:storyId', storyController.deleteStory);

module.exports = router;
