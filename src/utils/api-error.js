class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);

        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constuctor);
    }

    static badRequest(message = "Bad Request") {
        return new ApiError(400, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, message);
    }

    static conflict(message = "Conflict - User already exists") {
        return new ApiError(409, message);
    }

    static forbidden(message = "Forbidden") {
        return new ApiError(412, message);
    }

    static notFound(message = "Doesnt exist") {
        return new ApiError(412, message);
    }
}
// How to use - throw new ApiError()

export default ApiError;
