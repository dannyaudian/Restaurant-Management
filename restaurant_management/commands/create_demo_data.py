import click
import frappe
from frappe.commands import pass_context

@click.command('create-restaurant-demo-data')
@pass_context
def create_demo_data(context):
    """Create demo data for Restaurant Management App"""
    site = context.sites[0] if context.sites else frappe.utils.get_site_name(context)
    frappe.init(site=site)
    frappe.connect()
    try:
        from restaurant_management.setup.create_demo_data import create_demo_data
        create_demo_data()
        click.secho('Demo data created successfully!', fg='green')
    except Exception as e:
        click.secho(f'Error creating demo data: {str(e)}', fg='red')
    finally:
        frappe.destroy()

commands = [
    create_demo_data
]
