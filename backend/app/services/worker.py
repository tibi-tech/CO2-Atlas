"""Single background thread that executes queued runs one at a time."""

import logging
import queue
import shutil
import threading
import traceback

from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.models import Region, Run, engine, now
from app.pipeline import runner
from app.pipeline.grid import geometry_from_geojson

log = logging.getLogger(__name__)

_queue: "queue.Queue[int]" = queue.Queue()
_started = False


def enqueue(run_id: int) -> None:
    _queue.put(run_id)


def run_dir(run_id: int):
    return get_settings().runs_dir / str(run_id)


def _set_step(run_id: int, step: str, status: str, message: str | None) -> None:
    with Session(engine) as db:
        run = db.get(Run, run_id)
        steps = dict(run.steps or {})
        steps[step] = {"status": status, "message": message}
        run.steps = steps
        db.add(run)
        db.commit()


def _process(run_id: int) -> None:
    with Session(engine) as db:
        run = db.get(Run, run_id)
        if run is None or run.status not in ("queued", "running"):
            return
        region = db.get(Region, run.region_id)
        run.status, run.started_at, run.error = "running", now(), None
        run.steps = {s: {"status": "pending", "message": None} for s in runner.STEPS}
        db.add(run)
        db.commit()
        geom = geometry_from_geojson(region.geometry)
        params = runner.RunParams(year=run.year, month=run.month, method=run.method,
                                  **run.params)

    current = {"step": None}

    def progress(step: str, status: str, message: str | None) -> None:
        current["step"] = step
        _set_step(run_id, step, status, message)

    try:
        d = run_dir(run_id)
        shutil.rmtree(d, ignore_errors=True)
        result = runner.execute(d, geom, params, progress)
        status, error = "done", None
    except Exception as e:  # noqa: BLE001
        log.error("Run %s failed:\n%s", run_id, traceback.format_exc())
        result, status, error = None, "failed", str(e)
        if current["step"]:
            _set_step(run_id, current["step"], "failed", str(e))

    with Session(engine) as db:
        run = db.get(Run, run_id)
        run.status, run.result, run.error, run.finished_at = status, result, error, now()
        db.add(run)
        db.commit()


def _loop() -> None:
    while True:
        run_id = _queue.get()
        try:
            _process(run_id)
        finally:
            _queue.task_done()


def start() -> None:
    global _started
    if _started:
        return
    _started = True
    with Session(engine) as db:
        pending = db.exec(select(Run).where(Run.status.in_(["queued", "running"]))
                          .order_by(Run.id)).all()
        for r in pending:
            _queue.put(r.id)
    threading.Thread(target=_loop, name="run-worker", daemon=True).start()
