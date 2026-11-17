-- Runs only against an empty PostgreSQL volume. Passwords are supplied at runtime.
\getenv app_password SCOUTALERT_DB_PASSWORD
\getenv temporal_password TEMPORAL_DB_PASSWORD
CREATE ROLE scoutalert LOGIN PASSWORD :'app_password';
CREATE ROLE temporal LOGIN PASSWORD :'temporal_password';
CREATE DATABASE scoutalert OWNER scoutalert;
CREATE DATABASE temporal_visibility OWNER temporal;
CREATE DATABASE temporal OWNER temporal;
REVOKE ALL ON DATABASE scoutalert FROM PUBLIC;
REVOKE ALL ON DATABASE temporal FROM PUBLIC;
REVOKE ALL ON DATABASE temporal_visibility FROM PUBLIC;
