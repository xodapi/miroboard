# BPMN simulation guard

The interactive BPMN runner uses a deterministic transition guard of **100,000
steps**. A model that never reaches an end event fails with:

> The BPMN runner exceeded its deterministic step limit of 100000 transitions.
> Add a terminating branch or use simulation controls.

This is intentionally a user-visible error, rather than an indefinitely running
browser task. Terminating loops should include a finite exit branch to an end
event; high-volume scenarios should use the bounded simulation controls.
