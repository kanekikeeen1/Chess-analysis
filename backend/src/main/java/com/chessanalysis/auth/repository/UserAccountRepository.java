package com.chessanalysis.auth.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.chessanalysis.auth.entity.UserAccount;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    boolean existsByUsernameNormalized(String usernameNormalized);
    Optional<UserAccount> findByUsernameNormalized(String usernameNormalized);
}
