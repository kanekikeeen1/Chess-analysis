package com.chessanalysis.auth.analysis.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import com.chessanalysis.auth.analysis.service.FenRules;

public class ValidFenValidator implements ConstraintValidator<ValidFen, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true;
        String violation = FenRules.violation(value);
        if (violation == null) return true;
        // Trả lý do cụ thể thay cho thông báo chung để người dùng biết sửa chỗ nào.
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(violation).addConstraintViolation();
        return false;
    }
}
