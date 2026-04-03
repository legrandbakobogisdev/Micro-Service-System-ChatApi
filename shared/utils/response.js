class ApiResponse {
    static success(res, data = null, message = 'Success', statusCode = 200) {
        return res.status(statusCode).json({ success: true, message, data, timestamp: new Date().toISOString() });
    }

    static created(res, data, message = 'Resource created successfully') {
        return this.success(res, data, message, 201);
    }

    static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
        const response = { success: false, message, timestamp: new Date().toISOString() };
        if (errors) response.errors = errors;
        return res.status(statusCode).json(response);
    }

    static validationError(res, errors, message = 'Validation failed') {
        return this.error(res, message, 422, errors);
    }

    static notFound(res, message = 'Resource not found') {
        return this.error(res, message, 404);
    }

    static unauthorized(res, message = 'Unauthorized access') {
        return this.error(res, message, 401);
    }

    static forbidden(res, message = 'Access forbidden') {
        return this.error(res, message, 403);
    }

    static paginated(res, data, page = 1, limit = 10, total = 0, message = 'Success') {
        const totalPages = Math.ceil(total / limit);
        return res.status(200).json({
            success: true, message, data,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = ApiResponse;
