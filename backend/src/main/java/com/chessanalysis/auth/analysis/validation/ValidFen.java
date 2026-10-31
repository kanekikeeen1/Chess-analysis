package com.chessanalysis.auth.analysis.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Chuỗi phải là FEN hợp lệ theo {@link com.chessanalysis.auth.analysis.service.FenRules}.
 * Giá trị {@code null} được coi là hợp lệ; dùng kèm {@code @NotBlank} nếu bắt buộc.
 */
@Documented
@Constraint(validatedBy = ValidFenValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidFen {
    String message() default "FEN không hợp lệ.";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
