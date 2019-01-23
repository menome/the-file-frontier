# The File Frontier

The File Frontier is the entry point to our File Processing pipeline. It listens to crawler events on RabbitMQ, and decides what to do with the files.

Note: This requires a UNIX `file` command with an up-to-date magic.mgc listing in order to correctly route MS Office xml documents. I've bundled such a file in this repo, and it is currently being built into the docker container.
