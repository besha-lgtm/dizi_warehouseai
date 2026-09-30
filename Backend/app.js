require('dotenv').config();
const init = require('./config/server');
const auth = require('./config/auth');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const permissionsRoutes = require('./modules/permissions/permissions.routes');
const customerRoutes = require('./modules/customerMaster/customers.routes');
const supplierRoutes = require('./modules/supplierMaster/suppliers.routes');
const employeeRoutes = require('./modules/employees/employees.routes');
const departmentsRoutes = require('./modules/departments/departments.routes');
const layerSpecsRoutes = require('./modules/layerSpecs/layerSpecs.routes');
const customerPORoutes = require('./modules/customerPO/customerPO.routes');
const poApprovalRoutes = require('./modules/poApproval/poApproval.routes');
const salesOrdersRoutes = require('./modules/salesOrders/salesOrders.routes');
const supplierPORoutes = require('./modules/supplierPO/supplierPO.routes');
const materialReceiptRoutes = require('./modules/materialReceipt/materialReceipt.routes');
const qcIncomingRoutes = require('./modules/qcIncoming/qcIncoming.routes');
const productionPlanningRoutes = require('./modules/productionPlanning/productionPlanning.routes');
const productionExecutionRoutes = require('./modules/productionExecution/productionExecution.routes');
const stagewiseQcRoutes = require('./modules/stagewiseQc/stagewiseQc.routes');
const finishedGoodsRoutes = require('./modules/finishedGoods/finishedGoods.routes');
const dispatchRoutes = require('./modules/dispatch/dispatch.routes');
const dailyJobsRoutes = require('./modules/dailyJobs/dailyJobs.routes');
const itemPmsMasterRoutes = require('./modules/itemPmsMaster/itemPmsMaster.routes');
const uomMasterRoutes = require('./modules/uomMaster/uomMaster.routes');
const plantMasterRoutes = require('./modules/plantMaster/plantMaster.routes');

const start = async () => {
  const server = await init();

  await auth(server);

  server.route([
    { method: 'GET', path: '/api/health', options: { auth: false }, handler: () => ({ status: 'ok' }) },
    ...authRoutes,
    ...userRoutes,
    ...rolesRoutes,
    ...permissionsRoutes,
    ...customerRoutes,
    ...supplierRoutes,
    ...employeeRoutes,
    ...departmentsRoutes,
    ...layerSpecsRoutes,
    ...customerPORoutes,
    ...poApprovalRoutes,
    ...salesOrdersRoutes,
    ...supplierPORoutes,
    ...materialReceiptRoutes,
    ...qcIncomingRoutes,
    ...productionPlanningRoutes,
    ...productionExecutionRoutes,
    ...stagewiseQcRoutes,
    ...finishedGoodsRoutes,
    ...dispatchRoutes,
    ...dailyJobsRoutes,
    ...itemPmsMasterRoutes,
    ...uomMasterRoutes,
    ...plantMasterRoutes
  ]);

  server.ext('onPreResponse', (req, h) => {
    const res = req.response;
    if (res.isBoom) {
      return h.response({ success: false, message: res.message }).code(res.output.statusCode);
    }
    return h.continue;
  });

  await server.start();
  console.log('Visipack ERP API running on', server.info.uri);
};

start();