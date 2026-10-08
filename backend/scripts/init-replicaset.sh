#!/bin/sh
# Khởi tạo replica set cho MongoDB (chạy 1 lần sau khi container lên).
# Usage: ./scripts/init-replicaset.sh
set -e

docker exec e360sport-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0", members:[{_id:0, host:"localhost:27017"}]})'
echo "✅ Replica set rs0 đã khởi tạo."
