package com.chessanalysis.auth.exercise.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.exercise.dto.ExerciseAttemptRequest;
import com.chessanalysis.auth.exercise.dto.ExerciseAttemptResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseProgressResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseResponse;
import com.chessanalysis.auth.exercise.dto.ExercisePositionResponse;
import com.chessanalysis.auth.exercise.entity.ExerciseAttempt;
import com.chessanalysis.auth.exercise.entity.ExerciseLesson;
import com.chessanalysis.auth.exercise.entity.ExercisePosition;
import com.chessanalysis.auth.exercise.repository.ExerciseAttemptRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseLessonRepository;
import com.chessanalysis.auth.exercise.repository.ExercisePositionRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;

@Service
public class ExerciseService {
    private final ExerciseLessonRepository lessons;
    private final ExerciseAttemptRepository attempts;
    private final ExercisePositionRepository positions;
    private final AuthService authService;

    public ExerciseService(
            ExerciseLessonRepository lessons,
            ExerciseAttemptRepository attempts,
            ExercisePositionRepository positions,
            AuthService authService) {
        this.lessons = lessons;
        this.attempts = attempts;
        this.positions = positions;
        this.authService = authService;
    }

    @Transactional(readOnly = true)
    public ExercisePositionResponse randomPosition(String slug) {
        ExerciseLesson lesson = findLesson(slug);
        if (!"ENDGAME".equals(lesson.getCategory())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Bàn thực chiến ngẫu nhiên chỉ dành cho bài tàn cuộc.");
        }
        ExercisePosition position = positions.findRandomByLessonSlug(slug)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Bài tàn cuộc chưa có thế cờ thực hành."));
        return new ExercisePositionResponse(
                position.getId(), lesson.getSlug(), position.getStartingFen(), position.getGoalType());
    }

    @Transactional(readOnly = true)
    public List<ExerciseResponse> list() {
        return lessons.findAllByActiveTrueOrderBySortOrderAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ExerciseResponse get(String slug) {
        return toResponse(findLesson(slug));
    }

    @Transactional
    public ExerciseAttemptResponse recordAttempt(String token, String slug, ExerciseAttemptRequest request) {
        UserAccount user = authService.requireCurrentAccount(token);
        ExerciseAttempt attempt = attempts.save(new ExerciseAttempt(
                user,
                findLesson(slug),
                request.score(),
                request.completed(),
                Instant.now()));
        return new ExerciseAttemptResponse(
                attempt.getId(), attempt.getLesson().getSlug(), attempt.getScore(),
                attempt.isCompleted(), attempt.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public ExerciseProgressResponse progress(String token) {
        UserAccount user = authService.requireCurrentAccount(token);
        List<ExerciseAttempt> userAttempts = attempts.findAllByUserId(user.getId());
        Map<String, Integer> bestScores = new LinkedHashMap<>();
        for (ExerciseAttempt attempt : userAttempts) {
            bestScores.merge(attempt.getLesson().getSlug(), attempt.getScore(), Math::max);
        }
        long completedLessons = userAttempts.stream()
                .filter(ExerciseAttempt::isCompleted)
                .map(attempt -> attempt.getLesson().getId())
                .distinct()
                .count();
        return new ExerciseProgressResponse(userAttempts.size(), completedLessons, bestScores);
    }

    private ExerciseLesson findLesson(String slug) {
        return lessons.findBySlugAndActiveTrue(slug)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Không tìm thấy bài tập."));
    }

    private ExerciseResponse toResponse(ExerciseLesson lesson) {
        return new ExerciseResponse(
                lesson.getId(), lesson.getSlug(), lesson.getCategory(), lesson.getGroupName(),
                lesson.getTitle(), lesson.getDescription(), lesson.getStartingFen(),
                lesson.getSolutionLine(), lesson.getDifficulty(), lesson.getSortOrder());
    }
}
