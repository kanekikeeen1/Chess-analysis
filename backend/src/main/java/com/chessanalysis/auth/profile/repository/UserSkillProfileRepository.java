package com.chessanalysis.auth.profile.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.profile.entity.UserSkillProfile;

public interface UserSkillProfileRepository extends JpaRepository<UserSkillProfile, Long> {
    List<UserSkillProfile> findAllByUserId(Long userId);
    Optional<UserSkillProfile> findByUserIdAndTheme(Long userId, String theme);
    List<UserSkillProfile> findAllByUserIdOrderByMasteryAsc(Long userId);
}
