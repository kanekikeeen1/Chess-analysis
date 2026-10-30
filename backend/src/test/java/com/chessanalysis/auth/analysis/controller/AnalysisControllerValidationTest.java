package com.chessanalysis.auth.analysis.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.chessanalysis.auth.analysis.service.AnalysisJobService;
import com.chessanalysis.auth.analysis.service.MoveClassificationService;
import com.chessanalysis.auth.config.SecurityConfig;
import com.chessanalysis.auth.web.SessionCookieReader;
import com.fasterxml.jackson.databind.ObjectMapper;

@WebMvcTest(AnalysisController.class)
@Import({SecurityConfig.class, SessionCookieReader.class})
class AnalysisControllerValidationTest {
    private static final String FEN = "7k/8/8/8/8/4K3/8/6R1 w - - 0 1";
    private static final String AFTER = "7k/8/8/8/8/4K3/6R1/8 b - - 1 1";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AnalysisJobService jobs;

    @MockitoBean
    private MoveClassificationService moveClassification;

    @Test
    void classifyRejectsUciInjectionBeforeReachingService() throws Exception {
        Map<String, Object> move = Map.ofEntries(
                Map.entry("san", "Rg2"), Map.entry("uci", "g1g2"),
                Map.entry("beforeFen", FEN + "\nsetoption name Debug Log File value /app/app.jar"),
                Map.entry("afterFen", AFTER), Map.entry("sacrificeKind", "NONE"), Map.entry("legalMoveCount", 20));
        Map<String, Object> evaluation = Map.of("fen", FEN, "depth", 16, "moves", List.of(), "pawns", 0.0,
                "variations", List.of());
        String body = objectMapper.writeValueAsString(Map.of(
                "moves", List.of(move), "evaluations", List.of(evaluation, evaluation)));

        mvc.perform(post("/api/analysis/classify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields['moves[0].beforeFen']").exists());

        verify(moveClassification, never()).classify(any());
    }

    @Test
    void createJobRejectsIllegalPosition() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "sourceType", "FEN",
                "sourceText", "8/8/8/8/8/8/8/8 w - - 0 1",
                "positions", new String[] {"8/8/8/8/8/8/8/8 w - - 0 1"},
                "moves", new Object[0],
                "minDepth", 16,
                "maxDepth", 20));

        mvc.perform(post("/api/analysis/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        verify(jobs, never()).create(any(), any());
    }
}
