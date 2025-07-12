"""Session boot hooks for Restaurant Management app."""

def boot_session(bootinfo):
    """Modify bootinfo at session start.

    This function is called by Frappe/ERPNext during the boot process. It can
    be used to inject additional data into the bootinfo dictionary that is
    sent to the client when a user logs in.

    For now the implementation simply returns the bootinfo unchanged.
    """
    return bootinfo

