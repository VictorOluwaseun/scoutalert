#!/bin/sh
# Explicit, repeatable schema migrations; never overwrite an existing database.
set -eu
export SQL_DATABASE=temporal
temporal-sql-tool setup-schema -v 0.0
temporal-sql-tool update-schema -d /etc/temporal/schema/postgresql/v12/temporal/versioned
export SQL_DATABASE=temporal_visibility
temporal-sql-tool setup-schema -v 0.0
temporal-sql-tool update-schema -d /etc/temporal/schema/postgresql/v12/visibility/versioned
