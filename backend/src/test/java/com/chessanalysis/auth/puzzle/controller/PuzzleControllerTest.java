package com.chessanalysis.auth.puzzle.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.chessanalysis.auth.config.SecurityConfig;
import com.chessanalysis.auth.puzzle.entity.Puzzle;
import com.chessanalysis.auth.puzzle.repository.PuzzleRepository;
import com.chessanalysis.auth.puzzle.service.PuzzleRatingService;
import com.chessanalysis.auth.puzzle.service.PuzzleSelectionService;
import com.chessanalysis.auth.service.AuthService;
import com.chessanalysis.auth.web.SessionCookieReader;

@WebMvcTest(PuzzleController.class)
@Import({SecurityConfig.class, SessionCookieReader.class})
class PuzzleControllerTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PuzzleSelectionService selection;

    @MockitoBean
    private PuzzleRatingService ratings;

    @MockitoBean
    private PuzzleRepository puzzles;

    @MockitoBean
    private AuthService authService;

    @Test
    void guestGetsPuzzleNearRequestedRatingWithoutSolution() throws Exception {
        Puzzle puzzle = mock(Puzzle.class);
        when(puzzle.getId()).thenReturn(1L);
        when(puzzle.getStartFen()).thenReturn("q4knr/1ppk1Qpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 w - - 1 18");
        when(puzzle.getRating()).thenReturn(1760);
        when(puzzle.getThemes()).thenReturn("mate mateIn2");
        when(puzzle.getSolution()).thenReturn("a2e6 d7d8 f7f8");
        when(selection.next(isNull(), eq(1800.0), eq("fork"))).thenReturn(Optional.of(puzzle));

        mvc.perform(get("/api/puzzles/next").param("rating", "1800").param("theme", "fork"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playerSide").value("w"))
                .andExpect(jsonPath("$.themes[1]").value("mateIn2"))
                .andExpect(jsonPath("$.solution").doesNotExist());
    }

    @Test
    void rejectsMalformedParameters() throws Exception {
        mvc.perform(get("/api/puzzles/next").param("theme", "fork'; DROP TABLE"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/puzzles/next").param("rating", "abc"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/puzzles/next").param("rating", "9000"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reportsMissingPuzzleBankClearly() throws Exception {
        when(selection.next(any(), anyDouble(), any())).thenReturn(Optional.empty());
        mvc.perform(get("/api/puzzles/next"))
                .andExpect(status().isNotFound());
    }
}
