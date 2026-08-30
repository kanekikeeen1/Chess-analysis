ALTER TABLE user_sessions
    MODIFY COLUMN token_hash VARCHAR(64) NOT NULL;
