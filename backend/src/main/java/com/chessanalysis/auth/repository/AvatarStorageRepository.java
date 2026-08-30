package com.chessanalysis.auth.repository;

import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AvatarStorageRepository {
    private final JdbcTemplate jdbcTemplate;

    public AvatarStorageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean existsByUserId(Long userId) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user_avatar_images WHERE user_id = ?",
                Long.class,
                userId);
        return count != null && count > 0;
    }

    public Optional<AvatarData> findByUserId(Long userId) {
        return jdbcTemplate.query(
                "SELECT content_type, image_data FROM user_avatar_images WHERE user_id = ?",
                resultSet -> resultSet.next()
                        ? Optional.of(new AvatarData(
                                resultSet.getString("content_type"),
                                resultSet.getBytes("image_data")))
                        : Optional.empty(),
                userId);
    }

    public void save(Long userId, String contentType, byte[] data) {
        jdbcTemplate.update("""
                INSERT INTO user_avatar_images (user_id, content_type, image_data)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    content_type = VALUES(content_type),
                    image_data = VALUES(image_data)
                """, userId, contentType, data);
    }

    public void deleteByUserId(Long userId) {
        jdbcTemplate.update("DELETE FROM user_avatar_images WHERE user_id = ?", userId);
    }

    public record AvatarData(String contentType, byte[] data) {}
}
