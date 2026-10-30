package com.chessanalysis.auth.exercise.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chessanalysis.auth.entity.UserAccount;
import com.chessanalysis.auth.exercise.dto.ExerciseProgressResponse;
import com.chessanalysis.auth.exercise.dto.ExerciseResponse;
import com.chessanalysis.auth.exercise.entity.ExerciseAttempt;
import com.chessanalysis.auth.exercise.entity.ExerciseLesson;
import com.chessanalysis.auth.exercise.repository.ExerciseAttemptRepository;
import com.chessanalysis.auth.exercise.repository.ExerciseLessonRepository;
import com.chessanalysis.auth.service.ApiException;
import com.chessanalysis.auth.service.AuthService;

/**
 * Danh mục bài học và tiến trình. Lượt làm bài tàn cuộc chỉ được ghi bởi
 * {@link ExerciseSessionService} khi server xác nhận hoàn thành; không còn endpoint
 * để client tự nộp điểm.
 */
@Service
public class ExerciseService {
    private final ExerciseLessonRepository lessons;
    private final ExerciseAttemptRepository attempts;
    private final AuthService authService;

    public ExerciseService(
            ExerciseLessonRepository lessons,
            ExerciseAttemptRepository attempts,
            AuthService authService) {
        this.lessons = lessons;
        this.attempts = attempts;
        this.authService = authService;
    }

    @Transactional(readOnly = true)
    public List<ExerciseResponse> list() {
        return lessons.findAllByActiveTrueOrderBySortOrderAsc().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ExerciseResponse get(String slug) {
        return toResponse(findLesson(slug));
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
