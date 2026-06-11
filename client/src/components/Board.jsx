import { useState } from 'react'

const COLUMNS = [
  { id: 'Saved',       label: 'Wish List' },
  { id: 'Applied',     label: 'Applied' },
  { id: 'Interviewing',label: 'Interviewing' },
  { id: 'Offer',       label: 'Offer' },
  { id: 'Rejected',    label: 'Rejected' },
]

function JobCard({ job, onSelect, onDragStart }) {
  return (
    <div
      className="job-card"
      draggable
      onDragStart={e => onDragStart(e, job.id)}
      onClick={() => onSelect(job.id)}
    >
      <div className="card-title">{job.title}</div>
      <div className="card-company">{job.company}</div>
      {job.location && <div className="card-location">{job.location}</div>}
      {job.fit_score != null && (
        <div className="card-score" title="Fit score">
          {job.fit_score}%
        </div>
      )}
    </div>
  )
}

export default function Board({ jobs, onSelectJob, onStatusChange, onDeleteJob }) {
  const [dragOver, setDragOver] = useState(null)

  function handleDragStart(e, jobId) {
    e.dataTransfer.setData('jobId', String(jobId))
  }

  function handleDragOver(e, colId) {
    e.preventDefault()
    setDragOver(colId)
  }

  function handleDrop(e, colId) {
    e.preventDefault()
    setDragOver(null)
    const jobId = Number(e.dataTransfer.getData('jobId'))
    const job = jobs.find(j => j.id === jobId)
    if (job && job.status !== colId) onStatusChange(jobId, colId)
  }

  return (
    <div className="board">
      {COLUMNS.map(col => {
        const colJobs = jobs.filter(j => j.status === col.id)
        return (
          <div
            key={col.id}
            className={`board-column${dragOver === col.id ? ' drag-over' : ''}`}
            onDragOver={e => handleDragOver(e, col.id)}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, col.id)}
          >
            <div className="column-header">
              <span className="column-label">{col.label}</span>
              <span className="column-count">{colJobs.length}</span>
            </div>
            <div className="column-cards">
              {colJobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onSelect={onSelectJob}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
