package com.chessanalysis.auth.analysis.validation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.chessanalysis.auth.analysis.dto.CreateAnalysisJobRequest;
import com.chessanalysis.auth.analysis.dto.EvaluateMoveRequest;

/** Bảo đảm các DTO đi tới Stockfish thật sự chặn FEN/UCI độc hại ở tầng validate. */
class ValidFenValidatorTest {
    private static final String BEFORE = "7k/8/8/8/8/4K3/8/6R1 w - - 0 1";
    private static final String AFTER = "7k/8/8/8/8/4K3/6R1/8 b - - 1 1";
    private static final String INJECTED = BEFORE + "\nsetoption name Debug Log File value /app/app.jar";

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void acceptsWellFormedEvaluateMoveRequest() {
        assertTrue(validator.validate(new EvaluateMoveRequest(BEFORE, AFTER, "g1g2", false, 20)).isEmpty());
    }

    @Test
    void rejectsUciInjectionInEvaluateMoveRequest() {
        Set<ConstraintViolation<EvaluateMoveRequest>> violations =
                validator.validate(new EvaluateMoveRequest(INJECTED, AFTER, "g1g2", false, 20));
        assertEquals(1, violations.size());
        assertEquals("beforeFen", violations.iterator().next().getPropertyPath().toString());
    }

    @Test
    void rejectsMalformedUciMove() {
        assertEquals(1, validator.validate(
                new EvaluateMoveRequest(BEFORE, AFTER, "g1g2\nquit", false, 20)).size());
        assertEquals(1, validator.validate(
                new EvaluateMoveRequest(BEFORE, AFTER, "z9z9", false, 20)).size());
    }

    @Test
    void validatesEveryPositionOfAnalysisJob() {
        CreateAnalysisJobRequest request = new CreateAnalysisJobRequest(
                "FEN", BEFORE, List.of(INJECTED), List.of(), null, null, 16, 20);
        Set<ConstraintViolation<CreateAnalysisJobRequest>> violations = validator.validate(request);
        assertEquals(1, violations.size());
        assertTrue(violations.iterator().next().getPropertyPath().toString().startsWith("positions"));
    }
}
