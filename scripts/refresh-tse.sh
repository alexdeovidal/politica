#!/bin/sh
# Keep the scheduler command short and derive even after a partial source failure.
set -u
cd /data/politica-source || exit 1
export PYTHONPATH=/data/elosys-python:/data/politica-source
case "${1:-current}" in
  current) /bin/python3 -m elosys.tse.monitor ;;
  history) /bin/python3 -m elosys.tse.archive_monitor --max-updates 5 ;;
  *) exit 2 ;;
esac
collection_status=$?
/bin/python3 -m elosys.tse.derived
analysis_status=$?
if [ "$collection_status" -ne 0 ] || [ "$analysis_status" -ne 0 ]; then exit 1; fi
