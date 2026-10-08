#!/bin/sh
# Import bộ dữ liệu mẫu E360Sport (MongoDB extended JSON, dạng JSON array).
# Usage: ./scripts/import-data.sh "/c/Users/<ten>/Downloads/database-moi (1)/database"
set -e

SRC="$1"
if [ -z "$SRC" ]; then
  echo "Usage: ./scripts/import-data.sh <đường dẫn tới thư mục database>"
  exit 1
fi

docker exec e360sport-mongo mkdir -p /data/import

for f in users venues courts bookings payments slotlocks reviews favorites notifications platformsettings; do
  docker cp "$SRC/$f.json" e360sport-mongo:/data/import/"$f.json"
  docker exec e360sport-mongo mongoimport \
    --db datsan247 \
    --collection "$f" \
    --file "/data/import/$f.json" \
    --jsonArray \
    --drop
done

echo "✅ Import xong vào database datsan247."
