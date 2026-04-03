const asyncHandler = (fn) => (req, res, next) => {
    if (typeof next !== 'function') {
        console.error('[AsyncHandler] Error: next is not a function!', typeof next);
    }
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
