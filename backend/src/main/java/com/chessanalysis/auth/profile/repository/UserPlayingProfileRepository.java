package com.chessanalysis.auth.profile.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.profile.entity.UserPlayingProfile;

public interface UserPlayingProfileRepository extends JpaRepository<UserPlayingProfile, Long> {
}
