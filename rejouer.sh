#!/bin/sh
# Repart d'une base vide et rejoue projet.sql. S'arrête à la première erreur.
set -e
export MSYS_NO_PATHCONV=1   # Git Bash (Windows) : ne pas réécrire /tmp
cd "$(dirname "$0")"
docker compose exec -T db psql -U dnd -d postgres -c "DROP DATABASE IF EXISTS projet WITH (FORCE)" -c "CREATE DATABASE projet"
docker compose cp projet.sql db:/tmp/projet.sql
docker compose exec -T db psql -U dnd -d projet -v ON_ERROR_STOP=1 -f /tmp/projet.sql
