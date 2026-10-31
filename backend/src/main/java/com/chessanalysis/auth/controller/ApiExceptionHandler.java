package com.chessanalysis.auth.controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import jakarta.validation.ConstraintViolationException;

import com.chessanalysis.auth.analysis.engine.EngineUnavailableException;
import com.chessanalysis.auth.dto.ApiError;
import com.chessanalysis.auth.service.ApiException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApiException(ApiException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(EngineUnavailableException.class)
    ResponseEntity<ApiError> handleEngineUnavailable(EngineUnavailableException exception) {
        // Quá tải là trạng thái bình thường của một pool có giới hạn, không phải
        // lỗi máy chủ; trả 503 để frontend biết là nên thử lại.
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError(exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.badRequest()
                .body(new ApiError("Dữ liệu gửi lên chưa hợp lệ.", fields, Instant.now()));
    }

    /** Tham số query/path sai kiểu hoặc vi phạm ràng buộc (ví dụ {@code ?rating=abc}): lỗi của client. */
    @ExceptionHandler({
            ConstraintViolationException.class,
            HandlerMethodValidationException.class,
            MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> handleInvalidParameter(Exception exception) {
        return ResponseEntity.badRequest().body(new ApiError("Tham số yêu cầu không hợp lệ."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception) {
        LOGGER.error("Unexpected API error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("Máy chủ gặp lỗi. Hãy thử lại sau."));
    }
}
